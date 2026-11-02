import crypto from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import ExtraCharge from "../models/ExtraCharge.js";
import ProjectPaymentReceipt from "../models/ProjectPaymentReceipt.js";
import User from "../models/User.js";
import CustomerNotification from "../models/CustomerNotification.js";
import { getVerifiedExtraChargeReceiptBalance, providerAcceptedRecipient } from "../services/extraChargeReceiptSending.js";
import { getAdminPublicContact } from "../services/businessContact.js";
import { buildCustomerEmailTemplate } from "../services/customerEmailTemplate.js";
import { sendMail } from "../config/mailer.js";

const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });
const eligibleChargeStatuses = ["Approved", "Receipt Generated"];

const settlementKeyFor = (order, charges, originalTotal) => {
  const payments = (order.payment_records || [])
    .filter((payment) => payment.status === "verified")
    .map((payment) => [String(payment._id || ""), roundMoney(payment.verified_amount), payment.verified_at || null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const chargeSnapshot = charges.map((charge) => ({
    id: String(charge._id),
    total: roundMoney(charge.total),
    payments: (charge.payments || []).filter((payment) => payment.status === "verified")
      .map((payment) => [String(payment._id || ""), roundMoney(payment.amount), payment.verified_at || null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const snapshot = JSON.stringify({
    order: String(order._id),
    originalTotal: roundMoney(originalTotal),
    legacyVerified: roundMoney(order.legacy_verified_amount ?? order.amount_paid),
    paymentProof: {
      amount: roundMoney(order.payment_proof_amount),
      confirmedAt: order.payment_proof_confirmed_at || null,
    },
    payments,
    charges: chargeSnapshot,
    chargeTotal: roundMoney(order.installation_extra_charge_total),
  });
  return crypto.createHash("sha256").update(snapshot).digest("hex");
};

const loadProjectReceiptContext = async (orderId, receiptId = "") => {
  const order = await Order.findById(orderId).lean();
  if (!order) return { error: "Project not found.", status: 404 };
  const approvedCharges = await ExtraCharge.find({ order: orderId, status: { $in: eligibleChargeStatuses } })
    .sort({ createdAt: 1 }).lean();
  const balance = getVerifiedExtraChargeReceiptBalance(order, approvedCharges);
  const receipt = receiptId
    ? await ProjectPaymentReceipt.findOne({ _id: receiptId, order: orderId }).lean()
    : null;
  if (receiptId && !receipt) return { error: "Project payment receipt not found.", status: 404 };
  const customer = await User.findOne({ _id: order.customer, role: "customer" })
    .select("email first_name last_name is_active").lean();
  const customerEmail = String(customer?.email || "").trim().toLowerCase();
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || order.customer_name || "Customer";
  return { order, approvedCharges, balance, receipt, customer, customerEmail, customerName, settlementKey: settlementKeyFor(order, approvedCharges, balance.original_total) };
};

const sendStatusPayload = (context) => ({
  receipt: {
    _id: context.receipt._id,
    receipt_number: context.receipt.receipt_number,
    receipt_type: context.receipt.receipt_type,
    send_status: context.receipt.send_status || "Not Sent",
    recipient_email: context.receipt.recipient_email || "",
    sent_at: context.receipt.sent_at || null,
    provider_delivery_status: context.receipt.provider_delivery_status || "not_attempted",
    provider_name: context.receipt.provider_name || "",
    provider_message_id: context.receipt.provider_message_id || "",
    send_error: context.receipt.send_error || "",
    send_attempts: Number(context.receipt.send_attempts) || 0,
    send_history: context.receipt.send_history || [],
  },
  customer: { id: context.order.customer, name: context.customerName, email: context.customerEmail },
  project_reference: context.order.tracking || context.receipt.project_reference || "",
  balance: context.balance,
  send_block_reason: !context.balance.fully_paid
    ? context.balance.has_unverified_payments
      ? "A project payment is still pending verification. Verify it before sending the receipt."
      : `The verified project balance is PHP ${context.balance.remaining_balance.toFixed(2)}. Verify the remaining payment before sending the receipt.`
    : context.receipt.settlement_key !== context.settlementKey
      ? "Project charges or payments changed after this receipt was generated. Generate the current receipt again before sending."
      : !context.customer || context.customer.is_active === false
        ? "The customer needs an active registered account before a receipt can be emailed."
        : !context.customerEmail
          ? "The customer account has no registered email address."
          : "",
  can_send: Boolean(context.balance.fully_paid && context.receipt.settlement_key === context.settlementKey
    && context.customer?.is_active !== false && context.customerEmail
    && !["Sending", "Sent"].includes(context.receipt.send_status || "Not Sent")),
});

export const createOrGetProjectPaymentReceipt = async (req, res) => {
  const { orderId } = req.params;
  if (!validId(orderId)) return bad(res, "Invalid project reference.");
  const context = await loadProjectReceiptContext(orderId);
  if (context.error) return bad(res, context.error, context.status);
  if (!context.balance.fully_paid) return res.status(409).json({
    success: false,
    message: context.balance.has_unverified_payments
      ? "All project payments must be verified before generating the official receipt."
      : `The project still has a PHP ${context.balance.remaining_balance.toFixed(2)} balance.`,
    balance: context.balance,
  });
  if (!context.order.customer) return bad(res, "This project is not linked to a customer account.", 409);

  const issuedAt = new Date();
  const extraCharges = context.approvedCharges.map((charge) => ({
    description: charge.description || "Additional installation charge",
    reason: charge.reason || "",
    total: roundMoney(charge.total),
    items: Array.isArray(charge.items) ? charge.items : [],
    issued_at: charge.createdAt || null,
  }));
  const totalListedCharges = roundMoney(extraCharges.reduce((sum, charge) => sum + charge.total, 0));
  const unitemizedExtra = roundMoney(Math.max(context.balance.approved_extra_charges - totalListedCharges, 0));
  if (unitemizedExtra > 0.009) extraCharges.push({
    description: "Previously recorded additional installation charges",
    reason: "Imported project balance",
    total: unitemizedExtra,
    items: [{ description: "Additional installation charges", quantity: 1, unit_price: unitemizedExtra, total: unitemizedExtra }],
    issued_at: null,
  });

  const setOnInsert = {
    receipt_number: `PR-${issuedAt.getFullYear()}-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`,
    order: context.order._id,
    customer_id: context.order.customer,
    customer_name: context.customerName,
    customer_contact: context.order.customer_phone || context.customerEmail,
    project_reference: context.order.tracking || "",
    settlement_key: context.settlementKey,
    project_items: (context.order.items || []).map((item) => item.toObject?.() || item),
    extra_charges: extraCharges,
    original_project_amount: context.balance.original_total,
    total_extra_charges: context.balance.approved_extra_charges,
    total_project_charges: context.balance.total_project_charges,
    total_verified_payments: context.balance.total_verified_payments,
    remaining_balance: 0,
    issued_by: req.user.id,
    issued_by_name: [req.user.first_name, req.user.last_name].filter(Boolean).join(" ") || req.user.email || "Admin",
    issued_at: issuedAt,
  };
  let receipt;
  try {
    receipt = await ProjectPaymentReceipt.findOneAndUpdate(
      { order: context.order._id, settlement_key: context.settlementKey },
      { $setOnInsert: setOnInsert },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    receipt = await ProjectPaymentReceipt.findOne({ order: context.order._id, settlement_key: context.settlementKey }).lean();
    if (!receipt) throw error;
  }
  return res.status(200).json({ success: true, receipt, balance: context.balance, order: { _id: context.order._id, tracking: context.order.tracking, items: context.order.items } });
};

export const getProjectPaymentReceiptSendStatus = async (req, res) => {
  if (!validId(req.params.orderId) || !validId(req.params.receiptId)) return bad(res, "Invalid project or receipt reference.");
  const context = await loadProjectReceiptContext(req.params.orderId, req.params.receiptId);
  if (context.error) return bad(res, context.error, context.status);
  return res.json({ success: true, ...sendStatusPayload(context) });
};

const finishSendAttempt = (receiptId, attemptId, status, fields = {}) => ProjectPaymentReceipt.findOneAndUpdate(
  { _id: receiptId, send_status: "Sending" },
  {
    $set: {
      ...fields,
      send_status: status,
      "send_history.$[attempt].status": status,
      "send_history.$[attempt].completed_at": new Date(),
      "send_history.$[attempt].provider": fields.provider_name || "",
      "send_history.$[attempt].provider_message_id": fields.provider_message_id || "",
      "send_history.$[attempt].error": fields.send_error || "",
    },
  },
  { new: true, arrayFilters: [{ "attempt.attempt_id": attemptId }] },
).lean();

export const sendProjectPaymentReceiptToCustomer = async (req, res) => {
  const { orderId, receiptId } = req.params;
  if (!validId(orderId) || !validId(receiptId)) return bad(res, "Invalid project or receipt reference.");
  let context = await loadProjectReceiptContext(orderId, receiptId);
  if (context.error) return bad(res, context.error, context.status);
  if (!context.balance.fully_paid || context.receipt.settlement_key !== context.settlementKey) {
    return res.status(409).json({ success: false, message: "The receipt can only be sent when the current project settlement is fully paid and verified. Regenerate the receipt if project charges or payments changed.", balance: context.balance });
  }
  if (!context.customer || context.customer.is_active === false || !context.customerEmail) return bad(res, "The customer does not have an active account with a registered email address.", 409);
  if (String(req.body?.expected_recipient_email || "").trim().toLowerCase() !== context.customerEmail) return bad(res, "The customer's registered email changed or was not confirmed. Review the recipient and confirm again.", 409);
  const receiptPdf = req.file?.buffer;
  if (!Buffer.isBuffer(receiptPdf) || receiptPdf.length < 100 || receiptPdf.subarray(0, 5).toString() !== "%PDF-") return bad(res, "The generated receipt PDF is missing or invalid. Reopen the preview and try again.");
  if (["Sent", "Sending"].includes(context.receipt.send_status)) return bad(res, context.receipt.send_status === "Sent" ? "This receipt has already been sent." : "This receipt is already being sent.", 409);

  const attemptId = new mongoose.Types.ObjectId().toString();
  const attemptedAt = new Date();
  const claimed = await ProjectPaymentReceipt.findOneAndUpdate(
    { _id: receiptId, order: orderId, settlement_key: context.settlementKey, send_status: { $in: ["Not Sent", "Failed", null] } },
    { $set: { send_status: "Sending", recipient_email: context.customerEmail, send_error: "", provider_delivery_status: "pending" }, $inc: { send_attempts: 1 }, $push: { send_history: { attempt_id: attemptId, status: "Sending", attempted_at: attemptedAt, admin_id: req.user.id, recipient_email: context.customerEmail } } },
    { new: true, runValidators: true },
  ).lean();
  if (!claimed) return bad(res, "This receipt is already being sent or the project settlement has changed.", 409);

  let providerAccepted = false;
  let providerName = "";
  let providerMessageId = "";
  try {
    context = await loadProjectReceiptContext(orderId, receiptId);
    if (context.error || !context.balance.fully_paid || context.receipt.settlement_key !== context.settlementKey) throw new Error("The project settlement changed. The receipt email was not sent.");
    if (context.customerEmail !== String(claimed.recipient_email).toLowerCase()) throw new Error("The customer's registered email changed. The receipt email was not sent.");
    const businessContact = await getAdminPublicContact();
    const extraText = context.balance.approved_extra_charges > 0 ? ` Extra charges: PHP ${context.balance.approved_extra_charges.toFixed(2)}.` : "";
    const email = buildCustomerEmailTemplate({
      title: "Your Official ACGC Project Payment Receipt",
      summary: `Dear ${context.customerName}, your project balance has been fully paid and verified. Attached is your official Project Payment Receipt.${extraText}`,
      status: "Fully paid",
      orderId: context.order.tracking || context.receipt.project_reference || "",
      fields: [
        ["Receipt Number", context.receipt.receipt_number],
        ["Project Reference", context.order.tracking || ""],
        ["Original Project Amount", `PHP ${context.balance.original_total.toFixed(2)}`],
        ["Total Extra Charges", `PHP ${context.balance.approved_extra_charges.toFixed(2)}`],
        ["Total Project Charges", `PHP ${context.balance.total_project_charges.toFixed(2)}`],
        ["Total Verified Payments", `PHP ${context.balance.total_verified_payments.toFixed(2)}`],
        ["Remaining Balance", "PHP 0.00"],
      ],
      supportEmail: businessContact.email,
      supportPhone: businessContact.phone,
      footerMessage: "This official payment receipt was submitted to the email provider. Email delivery is subject to the recipient mail service.",
    });
    const result = await sendMail({
      from: process.env.EMAIL_FROM || "ACGC Glass & Aluminum Services <no-reply@acgc.com>",
      to: context.customerEmail,
      subject: `Your ACGC Project Payment Receipt - ${context.receipt.receipt_number}`,
      text: email.text,
      html: email.html,
      attachments: [...(email.attachments || []), { filename: `${context.receipt.receipt_number}.pdf`, content: receiptPdf, contentType: "application/pdf" }],
    }, { requireConfiguredProvider: true });
    if (!providerAcceptedRecipient(result, context.customerEmail)) throw new Error("The email provider did not confirm acceptance for the customer's address.");
    providerAccepted = true;
    providerName = String(result.provider || "smtp");
    providerMessageId = String(result.messageId || result.message?.messageId || result.response || "").slice(0, 500);
  } catch (error) {
    if (providerAccepted) return res.status(503).json({ success: false, message: "The email provider accepted the receipt, but its status could not be saved. Refresh the receipt status before retrying." });
    const message = String(error?.message || "The email provider did not accept the message.").slice(0, 1000);
    await finishSendAttempt(receiptId, attemptId, "Failed", { recipient_email: context.customerEmail, provider_delivery_status: "failed", provider_name: providerName, provider_message_id: providerMessageId, send_error: message });
    return res.status(502).json({ success: false, message: `Receipt email was not accepted. ${message}` });
  }

  let sentReceipt;
  try {
    sentReceipt = await finishSendAttempt(receiptId, attemptId, "Sent", {
      customer_id: context.order.customer,
      recipient_email: context.customerEmail,
      sent_at: new Date(),
      sent_by: req.user.id,
      provider_delivery_status: "accepted",
      provider_name: providerName,
      provider_message_id: providerMessageId,
      send_error: "",
    });
  } catch (error) {
    console.error("Unable to save accepted project receipt email status:", error);
    return res.status(503).json({ success: false, message: "The email provider accepted the receipt, but its status could not be saved. Refresh the receipt status before retrying." });
  }
  if (!sentReceipt) return res.status(503).json({ success: false, message: "The email provider accepted the receipt, but its status is still being finalized. Refresh the receipt status before retrying." });

  const eventKey = `project-payment-receipt:${sentReceipt._id}:sent`;
  try {
    await CustomerNotification.updateOne(
      { order: context.order._id, eventKey },
      { $setOnInsert: {
        customer: context.order.customer,
        order: context.order._id,
        project_receipt: sentReceipt._id,
        eventKey,
        type: "project_payment_receipt_sent",
        title: "Your Order Receipt",
        message: "Your order receipt has been sent successfully. Your project balance is fully paid. You can now view and download your receipt.",
        tracking: context.order.tracking || "",
        stageKey: "project_payment_receipt_sent",
        stageName: "Project payment receipt",
      } },
      { upsert: true },
    );
  } catch (error) {
    console.error("Project receipt was sent but its customer notification could not be saved:", error.message);
  }
  return res.json({ success: true, message: "Receipt email accepted by the provider.", receipt: sentReceipt, order: { _id: context.order._id, customer: context.order.customer, tracking: context.order.tracking }, balance: context.balance });
};

export const getCustomerProjectPaymentReceipt = async (req, res) => {
  const { orderId, receiptId } = req.params;
  if (!validId(orderId) || !validId(receiptId)) return bad(res, "Invalid project or receipt reference.");
  const receipt = await ProjectPaymentReceipt.findOne({ _id: receiptId, order: orderId, customer_id: req.user.id, send_status: "Sent" }).lean();
  if (!receipt) return bad(res, "This receipt has not been released to your account.", 404);
  const order = await Order.findOne({ _id: orderId, customer: req.user.id }).select("_id tracking items customer_name customer_phone customer_email").lean();
  if (!order) return bad(res, "Project not found.", 404);
  return res.json({ success: true, receipt, order });
};
