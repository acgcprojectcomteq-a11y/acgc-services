import mongoose from "mongoose";
import Order from "../models/Order.js";
import InstallationIssue from "../models/InstallationIssue.js";
import ExtraCharge from "../models/ExtraCharge.js";
import ExtraChargeReceipt from "../models/ExtraChargeReceipt.js";
import ProjectPaymentReceipt from "../models/ProjectPaymentReceipt.js";
import User from "../models/User.js";
import { getOrderPaymentAmounts } from "../services/paymentLedger.js";
import { getVerifiedExtraChargeReceiptBalance, providerAcceptedRecipient } from "../services/extraChargeReceiptSending.js";
import { getAdminPublicContact } from "../services/businessContact.js";
import { buildCustomerEmailTemplate } from "../services/customerEmailTemplate.js";
import { sendMail } from "../config/mailer.js";
import CustomerNotification from "../models/CustomerNotification.js";

const staffName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Staff";
const bad = (res, message, code = 400) => res.status(code).json({ success: false, message });
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const amount = (value) => Math.round(Number(value) * 100) / 100;
const toReceiptProjectItem = (item) => {
  const orderedQuantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const unitPrice = Number(item.unit_price ?? item.base_price) || 0;
  const lineTotal = amount(Number(item.line_total) > 0
    ? Number(item.line_total)
    : Number(item.estimated_price) > 0
      ? Number(item.estimated_price)
      : Number(item.manual_estimated_total) > 0
        ? Number(item.manual_estimated_total)
        : unitPrice * orderedQuantity);
  const width = Number(item.dimensions?.width ?? item.width) || 0;
  const height = Number(item.dimensions?.height ?? item.height) || 0;
  const measurementUnit = String(item.dimensions?.unit || item.measurement_unit || "in");
  const sourceUnit = String(item.unit || "piece").trim().toLowerCase().replace(/_/g, " ");
  const isSquareFootPricing = ["per sqft", "per sq ft", "sqft", "sq ft", "square feet"].includes(sourceUnit);
  const toFeet = measurementUnit === "in" ? 1 / 12 : measurementUnit === "cm" ? 1 / 30.48 : measurementUnit === "m" ? 1 / 0.3048 : 1;
  const squareFeet = Number(item.area) > 0 ? Number(item.area) : width > 0 && height > 0 ? width * toFeet * height * toFeet : 0;
  const hasLegacyAreaQuantity = item.receipt_quantity_normalized && isSquareFootPricing && squareFeet > 0;
  const quantity = Number(item.ordered_quantity) > 0
    ? Number(item.ordered_quantity)
    : hasLegacyAreaQuantity ? amount(orderedQuantity / squareFeet) : orderedQuantity;
  const unit = isSquareFootPricing ? "item" : String(item.unit || "piece");
  const detailParts = [
    width > 0 && height > 0 ? `Dimensions: ${width} x ${height} ${measurementUnit}` : "",
    squareFeet > 0 ? `Area: ${Number(squareFeet.toFixed(2))} sq ft` : "",
    Number(item.blade_count) > 0 ? `${Number(item.blade_count)} blade${Number(item.blade_count) === 1 ? "" : "s"}` : "",
    item.blade_glass_type ? `Glass: ${item.blade_glass_type}` : "",
    item.piece_option ? `Option: ${item.piece_option}` : "",
    item.frame_type ? `Frame: ${item.frame_type}` : "",
    ...(Array.isArray(item.additional_project_charges) ? item.additional_project_charges.map((entry) => `${entry.name || "Additional item"}: PHP ${amount(entry.amount).toFixed(2)}`) : []),
  ].filter(Boolean);
  return {
    name: String(item.name || item.product_name || "Project item"),
    product_name: String(item.product_name || ""),
    ordered_quantity: quantity,
    quantity,
    unit,
    receipt_quantity_normalized: true,
    line_total: lineTotal,
    estimated_price: Number(item.estimated_price) || 0,
    manual_estimated_total: Number(item.manual_estimated_total) || 0,
    unit_price: unitPrice,
    base_price: Number(item.base_price) || 0,
    area: squareFeet,
    width,
    height,
    measurement_unit: measurementUnit,
    dimensions: item.dimensions || null,
    blade_count: Number(item.blade_count) || 0,
    blade_glass_type: String(item.blade_glass_type || ""),
    piece_option: String(item.piece_option || ""),
    frame_type: String(item.frame_type || ""),
    additional_project_charges: item.additional_project_charges || [],
    details: detailParts.join(" | "),
    installation_status: item.installation_status || "Not Started",
    installation_status_history: item.installation_status_history || [],
  };
};
const syncInstallationExtraChargeTotal = async (orderId) => {
  const order = await Order.findById(orderId).select("installation_extra_charge_total installation_extra_charge_paid_total installation_extra_charge_total_initialized").lean();
  if (!order) return null;
  if (order.installation_extra_charge_total_initialized === true) return amount(order.installation_extra_charge_total);

  const approvedCharges = await ExtraCharge.find({ order: orderId, status: { $in: ["Approved", "Receipt Generated"] } }).select("total payments").lean();
  const recordedTotal = amount(approvedCharges.reduce((sum, charge) => sum + Number(charge.total || 0), 0));
  const recordedPaidTotal = amount(approvedCharges.reduce((sum, charge) => sum + (charge.payments || []).filter((payment) => payment.status === "verified").reduce((paid, payment) => paid + Number(payment.amount || 0), 0), 0));
  const total = amount(Math.max(Number(order.installation_extra_charge_total) || 0, recordedTotal));
  const paidTotal = amount(Math.max(Number(order.installation_extra_charge_paid_total) || 0, recordedPaidTotal));
  const result = await Order.updateOne(
    { _id: orderId, installation_extra_charge_total_initialized: { $ne: true } },
    { $set: { installation_extra_charge_total: total, installation_extra_charge_paid_total: paidTotal, installation_extra_charge_total_initialized: true } },
  );
  if (result.matchedCount) return total;
  const latestOrder = await Order.findById(orderId).select("installation_extra_charge_total").lean();
  return latestOrder ? amount(latestOrder.installation_extra_charge_total) : null;
};
const notifyCustomer = async (order, type, title, message, key, itemIndex = null) => {
  if (!order?.customer) return;
  try {
    await CustomerNotification.updateOne({ order: order._id, eventKey: key }, { $setOnInsert: {
      customer: order.customer, order: order._id, eventKey: key, type, title, message,
      tracking: order.tracking || "", stageKey: type, stageName: type === "extra_charge_update" ? "Extra charge" : "Installation issue", itemIndex,
    } }, { upsert: true });
  } catch (error) { console.error("Unable to create customer installation notification:", error.message); }
};
const timeToMinutes = (value) => { const match = String(value || "").match(/^(\d{2}):(\d{2})$/); if (!match) return null; const hours = Number(match[1]); const minutes = Number(match[2]); return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null; };
const dateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const key = value.slice(0, 10);
    const parsed = new Date(`${key}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};
const checkReturnVisitConflict = async (date, time, duration = 60, excludeIssueId = "") => {
  const day = dateKey(date);
  const start = timeToMinutes(time);
  if (!day || start === null) return "Choose a valid return visit date and time.";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (day < today) return "Return visits cannot be scheduled in the past.";
  if (day === today) {
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    if (start <= (timeToMinutes(now) ?? 0)) return "A same-day return visit must start in the future.";
  }
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(`${day}T23:59:59.999Z`);
  const scheduledOrders = await Order.find({ status: { $ne: "cancelled" }, $or: [
    { estimated_installation_date: { $gte: dayStart, $lte: dayEnd } },
    { inspection_date: { $gte: dayStart, $lte: dayEnd } },
  ] }).select("estimated_installation_date estimated_installation_time installation_duration_minutes inspection_date inspection_time inspection_duration_minutes inspection_travel_minutes").lean();
  const existingReturnVisits = await InstallationIssue.find({ ...(excludeIssueId ? { _id: { $ne: excludeIssueId } } : {}), status: "Return Visit Required", "return_visit.date": { $gte: dayStart, $lte: dayEnd } }).select("return_visit").lean();
  const end = start + Number(duration || 60);
  for (const scheduled of scheduledOrders) {
    const appointments = [
      { date: scheduled.estimated_installation_date, time: scheduled.estimated_installation_time, duration: Number(scheduled.installation_duration_minutes || 60) },
      { date: scheduled.inspection_date, time: scheduled.inspection_time, duration: Number(scheduled.inspection_duration_minutes || 30) + Number(scheduled.inspection_travel_minutes || 0) },
    ];
    for (const appointment of appointments) {
      const existingStart = timeToMinutes(appointment.time);
      if (dateKey(appointment.date) === day && existingStart !== null && start < existingStart + appointment.duration && existingStart < end) return "This return visit overlaps another scheduled installation or inspection.";
    }
  }
  for (const issue of existingReturnVisits) {
    const existingStart = timeToMinutes(issue.return_visit?.time);
    if (dateKey(issue.return_visit?.date) === day && existingStart !== null && start < existingStart + 60 && existingStart < end) return "This return visit overlaps another scheduled installation, inspection, or return visit.";
  }
  return "";
};

export const listInstallationBilling = async (req, res) => {
  const { orderId } = req.params;
  if (!validId(orderId)) return bad(res, "Invalid project reference.");
  const order = await Order.findById(orderId).select("customer customer_name tracking items installation_extra_charge_total installation_extra_charge_paid_total").lean();
  if (!order) return bad(res, "Project not found.", 404);
  const isAdmin = ["admin", "super_admin"].includes(req.user.role);
  const isCustomer = req.user.role === "customer";
  const isStaff = !isCustomer;
  if (!isStaff && String(order.customer) !== String(req.user.id)) return bad(res, "Project not found.", 404);
  if (isAdmin) {
    const legacyCharges = await ExtraCharge.find({ order: orderId, status: { $in: ["Draft", "Pending Approval"] } }).select("_id description reason total recorded_by_name").lean();
    await Promise.all(legacyCharges.map(async (legacyCharge) => {
      const approvedAt = new Date();
      const charge = await ExtraCharge.findOneAndUpdate(
        { _id: legacyCharge._id, order: orderId, status: { $in: ["Draft", "Pending Approval"] } },
        {
          $set: { status: "Approved", approved_by: null, approved_by_name: "Automatic approval", approved_at: approvedAt },
          $push: { approval_history: { action: "approved", reason: "Automatically approved to match the save-and-approve workflow.", by: null, by_name: "Automatic approval", at: approvedAt } },
        },
        { new: true, runValidators: true },
      );
      if (charge) {
        await Order.updateOne(
          { _id: orderId, installation_extra_charge_total_initialized: true },
          { $inc: {
            installation_extra_charge_total: amount(charge.total),
            installation_extra_charge_paid_total: amount((charge.payments || []).filter((payment) => payment.status === "verified").reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
          } },
        );
        await notifyCustomer(order, "extra_charge_update", "Extra charge approved", `${charge.description}: ${amount(charge.total).toFixed(2)}. Reason: ${charge.reason}`, `extra-charge:${charge._id}:approved`);
      }
    }));
  }
  const installationExtraChargeTotal = await syncInstallationExtraChargeTotal(orderId);
  if (installationExtraChargeTotal !== null) order.installation_extra_charge_total = installationExtraChargeTotal;
  const [issues, charges, receipts, projectReceipts, originalPayments] = await Promise.all([
    InstallationIssue.find({ order: orderId }).sort({ createdAt: -1 }).lean(),
    ExtraCharge.find({ order: orderId, ...(isAdmin ? {} : { status: { $in: ["Approved", "Receipt Generated"] } }) }).sort({ createdAt: -1 }).lean(),
    ExtraChargeReceipt.find({
      order: orderId,
      ...(["admin", "super_admin"].includes(req.user.role) ? {} : req.user.role === "customer" ? { send_status: "Sent" } : { _id: null }),
    }).sort({ issued_at: -1 }).lean(),
    ProjectPaymentReceipt.find({
      order: orderId,
      ...(["admin", "super_admin"].includes(req.user.role) ? {} : req.user.role === "customer" ? { customer_id: req.user.id, send_status: "Sent" } : { _id: null }),
    }).sort({ issued_at: -1 }).lean(),
    Order.findById(orderId),
  ]);
  const originalProjectSummary = getOrderPaymentAmounts({
    ...(originalPayments?.toObject?.() || originalPayments || {}),
    installation_extra_charge_total: 0,
    installation_extra_charge_paid_total: 0,
  });
  const payableCharges = charges.filter((charge) => ["Approved", "Receipt Generated"].includes(charge.status));
  const recordedExtraCharges = amount(payableCharges.reduce((sum, charge) => sum + charge.total, 0));
  const recordedExtraPayments = amount(payableCharges.reduce((sum, charge) => sum + (charge.payments || []).filter((payment) => payment.status === "verified").reduce((paid, payment) => paid + payment.amount, 0), 0));
  const extraApproved = amount(Math.max(recordedExtraCharges, Number(originalPayments?.installation_extra_charge_total) || 0));
  const extraPaid = amount(Math.max(recordedExtraPayments, Number(originalPayments?.installation_extra_charge_paid_total) || 0));
  const originalContractAmount = amount(originalProjectSummary.totalAmount);
  const originalOutstanding = amount(originalProjectSummary.remainingAmount);
  const viewCharges = isAdmin ? charges : charges.map((entry) => {
    const charge = { ...entry };
    delete charge.notes;
    delete charge.approval_history;
    charge.payments = (charge.payments || []).map((paymentEntry) => { const payment = { ...paymentEntry }; delete payment.reference; return payment; });
    if (!receipts.some((receipt) => String(receipt._id) === String(charge.receipt))) charge.receipt = null;
    return charge;
  });
  const visibleReceipts = isAdmin ? receipts : receipts.map((entry) => {
    const receipt = { ...entry };
    delete receipt.customer_id;
    delete receipt.sent_by;
    delete receipt.provider_name;
    delete receipt.provider_message_id;
    delete receipt.send_error;
    delete receipt.send_history;
    delete receipt.send_attempts;
    return receipt;
  });
  const visibleProjectReceipts = isAdmin ? projectReceipts : projectReceipts.map((entry) => {
    const receipt = { ...entry };
    delete receipt.customer_id;
    delete receipt.sent_by;
    delete receipt.provider_name;
    delete receipt.provider_message_id;
    delete receipt.send_error;
    delete receipt.send_history;
    delete receipt.send_attempts;
    return receipt;
  });
  const safeIssues = isAdmin ? issues : issues.map((entry) => {
    const issue = { ...entry };
    issue.history = (issue.history || []).map((historyEntry) => { const history = { ...historyEntry }; delete history.note; return history; });
    return issue;
  });
  const balance = {
    original_contract_amount: originalContractAmount,
    original_verified_payments: originalProjectSummary.paidAmount,
    original_outstanding: originalOutstanding,
    approved_extra_charges: extraApproved,
    verified_extra_charge_payments: extraPaid,
    current_total_outstanding: amount(originalOutstanding + Math.max(extraApproved - extraPaid, 0)),
  };
  const projectItems = (order.items || []).map((item) => ({
    ...toReceiptProjectItem(item.toObject?.() || item),
    installation_status_history: isAdmin ? item.installation_status_history || [] : [],
  }));
  res.json({ success: true, issues: safeIssues, charges: viewCharges, receipts: visibleReceipts, project_receipts: visibleProjectReceipts, project_items: projectItems, items: projectItems.map(({ name, installation_status, installation_status_history }) => ({ name, installation_status, installation_status_history })), balance: isAdmin || isCustomer ? balance : null });
};

export const updateInstallationStatus = async (req, res) => {
  if (!validId(req.params.orderId)) return bad(res, "Invalid project reference.");
  const order = await Order.findById(req.params.orderId);
  if (!order) return bad(res, "Project not found.", 404);
  const { item_index: itemIndex, status } = req.body || {};
  const statuses = ["Not Started", "Installation in Progress", "Installed", "For Adjustment", "Installation Completed"];
  if (itemIndex === undefined || itemIndex === null || itemIndex === "" || !Number.isInteger(Number(itemIndex)) || Number(itemIndex) < 0 || Number(itemIndex) >= order.items.length) return bad(res, "Affected installation item is invalid.");
  if (!statuses.includes(status)) return bad(res, "Invalid installation status.");
  const item = order.items[Number(itemIndex)];
  item.installation_status = status;
  item.installation_status_history.push({ status, changed_at: new Date(), changed_by: req.user.id, changed_by_name: staffName(req.user) });
  await order.save();
  return res.json({ success: true, orderId: order._id, itemIndex: Number(itemIndex), status, history: item.installation_status_history });
};

export const updateInstallationIssue = async (req, res) => {
  if (!validId(req.params.orderId) || !validId(req.params.issueId)) return bad(res, "Invalid issue reference.");
  const issue = await InstallationIssue.findOne({ _id: req.params.issueId, order: req.params.orderId });
  if (!issue) return bad(res, "Installation issue not found.", 404);
  const { status, note = "", return_visit = null, required_action } = req.body || {};
  const statuses = ["Open", "Under Assessment", "For Adjustment", "Return Visit Required", "Resolved"];
  if (status && !statuses.includes(status)) return bad(res, "Invalid issue status.");
  if (status === "Return Visit Required" && (!return_visit?.date || !String(return_visit?.reason || "").trim())) return bad(res, "A return visit date and reason are required.");
  if (status === "Return Visit Required") {
    const conflict = await checkReturnVisitConflict(return_visit.date, return_visit.time, return_visit.duration_minutes || 60, issue._id);
    if (conflict) return bad(res, conflict, 409);
  }
  if (status) {
    issue.status = status;
    issue.history.push({ status, note: String(note).trim(), changed_by: req.user.id, changed_by_name: staffName(req.user) });
  }
  if (return_visit) issue.return_visit = { date: return_visit.date, time: return_visit.time || "", reason: return_visit.reason };
  if (required_action !== undefined) issue.required_action = String(required_action).trim();
  await issue.save();
  const order = await Order.findById(req.params.orderId).select("customer tracking").lean();
  if (order && status) {
    const message = status === "Return Visit Required"
      ? `A return visit is scheduled for ${new Date(issue.return_visit.date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}${issue.return_visit.time ? ` at ${issue.return_visit.time}` : ""}.`
      : `Your installation issue status is now ${status}.`;
    await notifyCustomer(order, "installation_issue_update", "Installation issue update", message, `installation-issue:${issue._id}:${issue.status}:${issue.updatedAt?.getTime() || Date.now()}`, issue.item_index);
  }
  res.json({ success: true, issue });
};

export const createExtraCharge = async (req, res) => {
  const { orderId } = req.params;
  if (!validId(orderId)) return bad(res, "Invalid project reference.");
  const order = await Order.findById(orderId);
  if (!order) return bad(res, "Project not found.", 404);
  await syncInstallationExtraChargeTotal(orderId);
  const { installation_issue = null, item_index = null, description, reason, items, evidence_urls = [] } = req.body || {};
  if (!String(description || "").trim() || !String(reason || "").trim() || !Array.isArray(items) || !items.length) return bad(res, "Description, reason, and at least one charge item are required.");
  if (item_index !== null && (!Number.isInteger(Number(item_index)) || Number(item_index) < 0 || Number(item_index) >= order.items.length)) return bad(res, "Affected product is invalid.");
  if (!Array.isArray(evidence_urls) || evidence_urls.some((url) => typeof url !== "string" || url.length > 2000)) return bad(res, "Supporting evidence must be a list of valid URLs.");
  if (installation_issue && (!validId(installation_issue) || !await InstallationIssue.exists({ _id: installation_issue, order: orderId }))) return bad(res, "Related installation issue does not belong to this project.");
  const cleanItems = [];
  for (const item of items) {
    const description = String(item?.description || "").trim();
    const quantity = Number(item?.quantity);
    const rawUnitPrice = Number(item?.unit_price);
    const unit_price = amount(rawUnitPrice);
    if (!description || description.length > 300 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rawUnitPrice) || rawUnitPrice < 0 || !Number.isFinite(unit_price)) return bad(res, "Each charge item needs a description, positive quantity, and valid non-negative unit price.");
    cleanItems.push({ description, category: String(item.category || "Other").trim(), quantity, unit_price, total: amount(quantity * unit_price) });
  }
  const total = amount(cleanItems.reduce((sum, item) => sum + item.total, 0));
  if (total <= 0) return bad(res, "At least one charge item must have a price greater than zero.");

  const projectItems = (order.items || []).map((item) => toReceiptProjectItem(item.toObject?.() || item));
  const earlierCharges = await ExtraCharge.find({
    order: orderId,
    status: { $in: ["Approved", "Receipt Generated"] },
  }).select("description reason total payments createdAt receipt").lean();
  const earlierReceiptIds = earlierCharges.map((entry) => entry.receipt).filter(Boolean);
  const earlierReceipts = earlierReceiptIds.length
    ? await ExtraChargeReceipt.find({ _id: { $in: earlierReceiptIds } }).select("extra_charge receipt_number").lean()
    : [];
  const earlierReceiptNumbers = new Map(earlierReceipts.map((entry) => [String(entry.extra_charge), entry.receipt_number]));
  const otherCharges = earlierCharges.map((entry) => {
    const verifiedPaid = amount((entry.payments || [])
      .filter((payment) => payment.status === "verified")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    const chargeTotal = amount(entry.total);
    return {
      description: entry.description,
      reason: entry.reason,
      total: chargeTotal,
      verified_paid: verifiedPaid,
      remaining: amount(Math.max(chargeTotal - verifiedPaid, 0)),
      status: verifiedPaid >= chargeTotal ? "Paid" : verifiedPaid > 0 ? "Partially paid" : "Unpaid",
      receipt_number: earlierReceiptNumbers.get(String(entry._id)) || "",
      issued_at: entry.createdAt || null,
    };
  });

  let charge = null;
  let receipt = null;
  let updatedOrder = null;
  let balanceUpdated = false;
  try {
    charge = await ExtraCharge.create({
      order: orderId,
      installation_issue,
      item_index,
      description,
      reason,
      evidence_urls,
      items: cleanItems,
      total,
      status: "Receipt Generated",
      recorded_by: req.user.id,
      recorded_by_name: staffName(req.user),
      approval_history: [
        { action: "created", by: req.user.id, by_name: staffName(req.user) },
      ],
    });

    const balanceUpdate = await Order.updateOne(
      { _id: orderId },
      { $inc: { installation_extra_charge_total: total }, $set: { installation_extra_charge_total_initialized: true } },
    );
    if (!balanceUpdate.matchedCount) {
      const error = new Error("The installation charge was not added to the project balance. Please try again.");
      error.statusCode = 409;
      throw error;
    }
    balanceUpdated = true;

    updatedOrder = await Order.findById(orderId);
    if (!updatedOrder) {
      const error = new Error("Project not found while updating its balance.");
      error.statusCode = 404;
      throw error;
    }
    const paymentSummary = getOrderPaymentAmounts(updatedOrder);
    const updatedOutstanding = amount(paymentSummary.remainingAmount);
    const previousOutstanding = amount(Math.max(updatedOutstanding - total, 0));
    const issuedAt = new Date();
    receipt = await ExtraChargeReceipt.create({
      receipt_number: `EC-${issuedAt.getFullYear()}-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`,
      order: updatedOrder._id,
      extra_charge: charge._id,
      customer_name: updatedOrder.customer_name,
      customer_contact: updatedOrder.customer_phone || updatedOrder.customer_email,
      project_reference: updatedOrder.tracking,
      item_index: charge.item_index,
      affected_item: charge.item_index === null || charge.item_index === undefined ? "Project installation" : updatedOrder.items[charge.item_index]?.name || `Item ${Number(charge.item_index) + 1}`,
      project_items: projectItems,
      other_charges: otherCharges,
      project_total_before_charge: amount(Math.max(paymentSummary.totalAmount - total, 0)),
      project_total_after_charge: amount(paymentSummary.totalAmount),
      items: cleanItems,
      description: charge.description,
      reason: charge.reason,
      total: charge.total,
      previous_outstanding: previousOutstanding,
      updated_outstanding_at_issue: updatedOutstanding,
      issued_by: req.user.id,
      issued_by_name: staffName(req.user),
      issued_at: issuedAt,
      customer_id: updatedOrder.customer,
    });
    charge.receipt = receipt._id;
    charge.approval_history.push({ action: "receipt_issued", reason: "Generated automatically when the charge was saved.", by: req.user.id, by_name: staffName(req.user), at: issuedAt });
    await charge.save();
  } catch (error) {
    await Promise.allSettled([
      receipt ? ExtraChargeReceipt.deleteOne({ _id: receipt._id }) : Promise.resolve(),
      charge ? ExtraCharge.deleteOne({ _id: charge._id }) : Promise.resolve(),
      balanceUpdated ? Order.updateOne({ _id: orderId }, { $inc: { installation_extra_charge_total: -total } }) : Promise.resolve(),
    ]);
    if (error?.code === 11000) return bad(res, "The installation charge receipt could not be created because a duplicate receipt already exists.", 409);
    if (error?.statusCode) return bad(res, error.message, error.statusCode);
    throw error;
  }

  await notifyCustomer(order, "extra_charge_update", "Additional installation charge added", `${charge.description}: ${amount(charge.total).toFixed(2)} was added to your project total and transaction balance. The receipt will be available after it has been sent. Reason: ${charge.reason}`, `extra-charge:${charge._id}:posted`);
  res.status(201).json({ success: true, charge, receipt, order: { _id: updatedOrder._id, customer: updatedOrder.customer, tracking: updatedOrder.tracking } });
};

const receiptSendContext = async (orderId, receiptId) => {
  const order = await Order.findById(orderId).lean();
  if (!order) return { error: "Project not found.", status: 404 };
  const receipt = await ExtraChargeReceipt.findOne({ _id: receiptId, order: orderId }).lean();
  if (!receipt) return { error: "Extra charge receipt not found for this project.", status: 404 };
  const charge = await ExtraCharge.findOne({ _id: receipt.extra_charge, order: orderId, status: { $in: ["Approved", "Receipt Generated"] } }).lean();
  if (!charge || String(charge.receipt) !== String(receipt._id) || amount(charge.total) !== amount(receipt.total)) {
    return { error: "This receipt is not linked to a valid approved project charge.", status: 409 };
  }
  const approvedCharges = await ExtraCharge.find({ order: orderId, status: { $in: ["Approved", "Receipt Generated"] } }).select("total payments").lean();
  const balance = getVerifiedExtraChargeReceiptBalance(order, approvedCharges);
  const customer = await User.findOne({ _id: order.customer, role: "customer" }).select("email first_name last_name is_active").lean();
  const customerEmail = String(customer?.email || "").trim().toLowerCase();
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || receipt.customer_name || order.customer_name || "Customer";
  return { order, receipt, charge, approvedCharges, balance, customer, customerEmail, customerName };
};

const sendStatusPayload = (context) => ({
  receipt: {
    _id: context.receipt._id,
    receipt_number: context.receipt.receipt_number,
    receipt_type: context.receipt.receipt_type || "Extra Charge Receipt",
    send_status: context.receipt.send_status || "Not Sent",
    recipient_email: context.receipt.recipient_email || "",
    sent_at: context.receipt.sent_at || null,
    sent_by: context.receipt.sent_by || null,
    provider_delivery_status: context.receipt.provider_delivery_status || "not_attempted",
    provider_name: context.receipt.provider_name || "",
    provider_message_id: context.receipt.provider_message_id || "",
    send_error: context.receipt.send_error || "",
    send_attempts: Number(context.receipt.send_attempts) || 0,
    send_history: context.receipt.send_history || [],
  },
  customer: {
    id: context.order.customer,
    name: context.customerName,
    email: context.customerEmail,
  },
  project_reference: context.order.tracking || context.receipt.project_reference || "",
  balance: context.balance,
  send_block_reason: !context.balance.fully_paid
    ? context.balance.has_unverified_payments
      ? "A project payment is still pending verification. Verify or resolve it before sending the receipt."
      : `The verified project balance is PHP ${amount(context.balance.remaining_balance).toFixed(2)}. Collect and verify the remaining payment before sending the receipt.`
    : !context.customer || context.customer.is_active === false
      ? "The customer needs an active registered account before a receipt can be emailed."
      : !context.customerEmail
        ? "The customer account has no registered email address. Add an email before sending the receipt."
        : "",
  can_send: Boolean(context.balance.fully_paid && context.customer?.is_active !== false && context.customerEmail
    && !["Sending", "Sent"].includes(context.receipt.send_status || "Not Sent")),
});

export const getExtraChargeReceiptSendStatus = async (req, res) => {
  const { orderId, receiptId } = req.params;
  if (!validId(orderId) || !validId(receiptId)) return bad(res, "Invalid project or receipt reference.");
  const context = await receiptSendContext(orderId, receiptId);
  if (context.error) return bad(res, context.error, context.status);
  return res.json({ success: true, ...sendStatusPayload(context) });
};

const finishReceiptSendAttempt = async (receiptId, attemptId, status, fields = {}) => {
  const { provider = "", ...receiptFields } = fields;
  return ExtraChargeReceipt.findOneAndUpdate(
    { _id: receiptId, send_status: "Sending" },
    {
      $set: {
        send_status: status,
        ...receiptFields,
        "send_history.$[attempt].status": status,
        "send_history.$[attempt].completed_at": new Date(),
        "send_history.$[attempt].provider": provider,
        "send_history.$[attempt].provider_message_id": fields.provider_message_id || "",
        "send_history.$[attempt].error": fields.send_error || "",
      },
    },
    { new: true, arrayFilters: [{ "attempt.attempt_id": attemptId }] },
  ).lean();
};

const safeProviderError = (error) => String(error?.message || "The email provider did not accept the message.").slice(0, 1000);

export const sendExtraChargeReceiptToCustomer = async (req, res) => {
  const { orderId, receiptId } = req.params;
  if (!validId(orderId) || !validId(receiptId)) return bad(res, "Invalid project or receipt reference.");
  let context = await receiptSendContext(orderId, receiptId);
  if (context.error) return bad(res, context.error, context.status);
  if (!context.balance.fully_paid) {
    return res.status(409).json({ success: false, message: "The entire project balance must be paid with verified payments before this receipt can be sent.", balance: context.balance });
  }
  if (!context.customer || context.customer.is_active === false || !context.customerEmail) {
    return bad(res, "The customer does not have an active account with a registered email address.", 409);
  }
  const confirmedRecipient = String(req.body?.expected_recipient_email || "").trim().toLowerCase();
  if (confirmedRecipient && confirmedRecipient !== context.customerEmail) {
    return bad(res, "The customer's registered email changed. Review the updated recipient and confirm again.", 409);
  }
  const receiptPdf = req.file?.buffer;
  if (!Buffer.isBuffer(receiptPdf) || receiptPdf.length < 100 || receiptPdf.subarray(0, 5).toString() !== "%PDF-") {
    return bad(res, "The generated receipt PDF is missing or invalid. Reopen the preview and try again.", 400);
  }
  if (context.receipt.send_status === "Sent") return bad(res, "This receipt has already been sent.", 409);
  if (context.receipt.send_status === "Sending") return bad(res, "This receipt is already being sent. Wait for the current attempt to finish.", 409);

  const attemptId = new mongoose.Types.ObjectId().toString();
  const attemptedAt = new Date();
  const claimedReceipt = await ExtraChargeReceipt.findOneAndUpdate(
    { _id: receiptId, order: orderId, send_status: { $in: ["Not Sent", "Failed", null] } },
    {
      $set: {
        send_status: "Sending",
        customer_id: context.order.customer,
        recipient_email: context.customerEmail,
        send_error: "",
        provider_delivery_status: "pending",
      },
      $inc: { send_attempts: 1 },
      $push: { send_history: {
        attempt_id: attemptId,
        status: "Sending",
        attempted_at: attemptedAt,
        admin_id: req.user.id,
        recipient_email: context.customerEmail,
      } },
    },
    { new: true, runValidators: true },
  ).lean();
  if (!claimedReceipt) {
    const latest = await ExtraChargeReceipt.findById(receiptId).select("send_status").lean();
    return bad(res, latest?.send_status === "Sent" ? "This receipt has already been sent." : "This receipt is already being sent. Wait for the current attempt to finish.", 409);
  }

  let providerAccepted = false;
  let provider = "";
  let providerMessageId = "";
  try {
    // Re-read all project charges and verified payments immediately before sending.
    context = await receiptSendContext(orderId, receiptId);
    if (context.error) throw new Error(context.error);
    if (!context.balance.fully_paid) throw new Error("The project balance changed and is no longer fully paid. No receipt email was sent.");
    if (!context.customerEmail || context.customerEmail !== String(claimedReceipt.recipient_email).toLowerCase()) {
      throw new Error("The customer's registered email changed during this send attempt. No receipt email was sent.");
    }

    const businessContact = await getAdminPublicContact();
    const email = buildCustomerEmailTemplate({
      title: "Your ACGC Extra Charge Receipt",
      summary: `Dear ${context.customerName}, your project balance has been fully settled. Attached is your official Extra Charge Receipt for your records.`,
      status: "Fully paid",
      orderId: context.order.tracking || context.receipt.project_reference || "",
      fields: [
        ["Receipt Number", context.receipt.receipt_number],
        ["Receipt Type", context.receipt.receipt_type || "Extra Charge Receipt"],
        ["Project Reference", context.order.tracking || context.receipt.project_reference || ""],
        ["Total Project Charges", `PHP ${context.balance.total_project_charges.toFixed(2)}`],
        ["Total Verified Payments", `PHP ${context.balance.total_verified_payments.toFixed(2)}`],
        ["Remaining Balance", "PHP 0.00"],
      ],
      supportEmail: businessContact.email,
      supportPhone: businessContact.phone,
      footerMessage: "This email confirms that your official extra charge receipt was submitted to the email provider. Email delivery is subject to the recipient mail service.",
    });
    const result = await sendMail({
      from: process.env.EMAIL_FROM || "ACGC Glass & Aluminum Services <no-reply@acgc.com>",
      to: context.customerEmail,
      subject: `Your ACGC Extra Charge Receipt - ${context.receipt.receipt_number}`,
      text: email.text,
      html: email.html,
      attachments: [
        ...(email.attachments || []),
        { filename: `${context.receipt.receipt_number}.pdf`, content: receiptPdf, contentType: "application/pdf" },
      ],
    }, { requireConfiguredProvider: true });
    if (!providerAcceptedRecipient(result, context.customerEmail)) {
      throw new Error("The email provider did not confirm acceptance for the customer's email address.");
    }
    providerAccepted = true;
    provider = String(result.provider || "smtp");
    providerMessageId = String(result.messageId || result.message?.messageId || result.response || "").slice(0, 500);
  } catch (error) {
    if (providerAccepted) {
      // Do not offer a retry that could send a duplicate if the provider accepted
      // the message but MongoDB could not persist that acceptance.
      console.error("Receipt email was accepted but its status could not be finalized:", error);
      return res.status(503).json({ success: false, message: "The email provider accepted the receipt, but its status could not be saved. Do not retry yet; refresh the receipt status." });
    }
    const message = safeProviderError(error);
    await finishReceiptSendAttempt(receiptId, attemptId, "Failed", {
      recipient_email: context.customerEmail,
      provider_delivery_status: "failed",
      provider_name: provider,
      provider,
      provider_message_id: providerMessageId,
      send_error: message,
    });
    return res.status(502).json({ success: false, message: `Receipt email was not accepted. ${message}` });
  }

  const sentAt = new Date();
  let sentReceipt;
  try {
    sentReceipt = await finishReceiptSendAttempt(receiptId, attemptId, "Sent", {
      customer_id: context.order.customer,
      recipient_email: context.customerEmail,
      sent_at: sentAt,
      sent_by: req.user.id,
      provider_delivery_status: "accepted",
      provider_name: provider,
      provider,
      provider_message_id: providerMessageId,
      send_error: "",
    });
  } catch (error) {
    console.error("Unable to save accepted receipt email status:", error);
    return res.status(503).json({ success: false, message: "The email provider accepted the receipt, but its status could not be saved. Do not retry yet; refresh the receipt status." });
  }
  if (!sentReceipt) return res.status(503).json({ success: false, message: "The email provider accepted the receipt, but its status is still being finalized. Do not retry yet; refresh the receipt status." });

  const notificationMessage = "Your order receipt has been sent successfully. Your project balance is fully paid. You can now view and download your receipt.";
  try {
    await CustomerNotification.updateOne(
      { order: context.order._id, eventKey: `extra-charge-receipt:${context.receipt._id}:sent` },
      { $setOnInsert: {
        customer: context.order.customer,
        order: context.order._id,
        receipt: context.receipt._id,
        eventKey: `extra-charge-receipt:${context.receipt._id}:sent`,
        type: "extra_charge_receipt_sent",
        title: "Your Order Receipt",
        message: notificationMessage,
        tracking: context.order.tracking || "",
        stageKey: "extra_charge_receipt_sent",
        stageName: "Extra charge receipt",
      } },
      { upsert: true },
    );
  } catch (error) {
    console.error("Receipt was sent but its customer notification could not be saved:", error.message);
  }

  return res.json({
    success: true,
    message: "Receipt email accepted by the provider.",
    receipt: sentReceipt,
    order: { _id: context.order._id, customer: context.order.customer, tracking: context.order.tracking },
    balance: context.balance,
  });
};
