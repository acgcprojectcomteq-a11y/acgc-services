import mongoose from "mongoose";
import Order from "../models/Order.js";
import InstallationIssue from "../models/InstallationIssue.js";
import ExtraCharge from "../models/ExtraCharge.js";
import ExtraChargeReceipt from "../models/ExtraChargeReceipt.js";
import { getOrderPaymentAmounts } from "../services/paymentLedger.js";
import CustomerNotification from "../models/CustomerNotification.js";

const staffName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Staff";
const bad = (res, message, code = 400) => res.status(code).json({ success: false, message });
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const amount = (value) => Math.round(Number(value) * 100) / 100;
const verifiedOriginalPayments = (order) => getOrderPaymentAmounts(order).paidAmount;
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
  const order = await Order.findById(orderId).select("customer customer_name items").lean();
  if (!order) return bad(res, "Project not found.", 404);
  const isAdmin = ["admin", "super_admin"].includes(req.user.role);
  const isCustomer = req.user.role === "customer";
  const isStaff = !isCustomer;
  if (!isStaff && String(order.customer) !== String(req.user.id)) return bad(res, "Project not found.", 404);
  const [issues, charges, receipts, originalPayments] = await Promise.all([
    InstallationIssue.find({ order: orderId }).sort({ createdAt: -1 }).lean(),
    ExtraCharge.find({ order: orderId, ...(isAdmin ? {} : { status: { $in: ["Approved", "Receipt Generated"] } }) }).sort({ createdAt: -1 }).lean(),
    ExtraChargeReceipt.find({ order: orderId, ...(["admin", "super_admin", "customer"].includes(req.user.role) ? {} : { _id: null }) }).sort({ issued_at: -1 }).lean(),
    Order.findById(orderId),
  ]);
  const originalSummary = getOrderPaymentAmounts(originalPayments);
  const payableCharges = charges.filter((charge) => ["Approved", "Receipt Generated"].includes(charge.status));
  const extraApproved = amount(payableCharges.reduce((sum, charge) => sum + charge.total, 0));
  const extraPaid = amount(payableCharges.reduce((sum, charge) => sum + (charge.payments || []).filter((payment) => payment.status === "verified").reduce((paid, payment) => paid + payment.amount, 0), 0));
  const viewCharges = isAdmin ? charges : charges.map((entry) => {
    const charge = { ...entry };
    delete charge.notes;
    delete charge.approval_history;
    charge.payments = (charge.payments || []).map((paymentEntry) => { const payment = { ...paymentEntry }; delete payment.reference; return payment; });
    return charge;
  });
  const safeIssues = isAdmin ? issues : issues.map((entry) => {
    const issue = { ...entry };
    issue.history = (issue.history || []).map((historyEntry) => { const history = { ...historyEntry }; delete history.note; return history; });
    return issue;
  });
  const balance = { original_contract_amount: originalSummary.totalAmount, original_verified_payments: originalSummary.paidAmount, original_outstanding: originalSummary.remainingAmount, approved_extra_charges: extraApproved, verified_extra_charge_payments: extraPaid, current_total_outstanding: amount(originalSummary.remainingAmount + Math.max(extraApproved - extraPaid, 0)) };
  res.json({ success: true, issues: safeIssues, charges: viewCharges, receipts, items: (order.items || []).map((item) => ({ name: item.name, installation_status: item.installation_status || "Not Started", installation_status_history: isAdmin ? item.installation_status_history || [] : [] })), balance: isAdmin || isCustomer ? balance : null });
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

export const createInstallationIssue = async (req, res) => {
  const { orderId } = req.params;
  if (!validId(orderId)) return bad(res, "Invalid project reference.");
  const order = await Order.findById(orderId).select("items customer tracking");
  if (!order) return bad(res, "Project not found.", 404);
  const { issue_type, description, item_index = null, measurement_details = "", required_action = "", evidence_urls = [] } = req.body || {};
  if (!String(issue_type || "").trim() || !String(description || "").trim()) return bad(res, "Issue type and description are required.");
  if (item_index !== null && (!Number.isInteger(Number(item_index)) || Number(item_index) < 0 || Number(item_index) >= order.items.length)) return bad(res, "Affected product is invalid.");
  if (!Array.isArray(evidence_urls) || evidence_urls.some((url) => typeof url !== "string" || url.length > 2000)) return bad(res, "Evidence must be a list of valid URLs.");
  const issue = await InstallationIssue.create({ order: orderId, item_index, issue_type, description, measurement_details, required_action, evidence_urls, reported_by: req.user.id, reported_by_name: staffName(req.user), history: [{ status: "Open", changed_by: req.user.id, changed_by_name: staffName(req.user) }] });
  await notifyCustomer(order, "installation_issue_update", "Installation issue reported", `An installation issue was reported: ${String(issue.issue_type)}.`, `installation-issue:${issue._id}:created`, item_index);
  res.status(201).json({ success: true, issue });
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
  const order = await Order.findById(orderId).select("items");
  if (!order) return bad(res, "Project not found.", 404);
  const { installation_issue = null, item_index = null, description, reason, notes = "", items, evidence_urls = [], customer_chargeable = false } = req.body || {};
  if (!String(description || "").trim() || !String(reason || "").trim() || !Array.isArray(items) || !items.length) return bad(res, "Description, reason, and at least one charge item are required.");
  if (customer_chargeable !== true) return bad(res, "Confirm that the additional work has been assessed as chargeable to the customer before creating this charge.");
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
  const charge = await ExtraCharge.create({ order: orderId, installation_issue, item_index, description, reason, customer_chargeable, notes, evidence_urls, items: cleanItems, total, recorded_by: req.user.id, recorded_by_name: staffName(req.user), approval_history: [{ action: "created", by: req.user.id, by_name: staffName(req.user) }] });
  res.status(201).json({ success: true, charge });
};

export const submitExtraCharge = async (req, res) => {
  if (!validId(req.params.orderId) || !validId(req.params.chargeId)) return bad(res, "Invalid charge reference.");
  const charge = await ExtraCharge.findOne({ _id: req.params.chargeId, order: req.params.orderId });
  if (!charge) return bad(res, "Extra charge not found.", 404);
  if (charge.status !== "Draft") return bad(res, "Only draft charges can be submitted for approval.", 409);
  charge.status = "Pending Approval";
  charge.approval_history.push({ action: "submitted", by: req.user.id, by_name: staffName(req.user) });
  try { await charge.save(); }
  catch (error) { if (error?.name === "VersionError") return bad(res, "This charge changed while you were reviewing it. Refresh and try again.", 409); throw error; }
  res.json({ success: true, charge });
};

export const reviewExtraCharge = async (req, res) => {
  if (!validId(req.params.orderId) || !validId(req.params.chargeId)) return bad(res, "Invalid charge reference.");
  const charge = await ExtraCharge.findOne({ _id: req.params.chargeId, order: req.params.orderId });
  if (!charge) return bad(res, "Extra charge not found.", 404);
  if (charge.status !== "Pending Approval") return bad(res, "Only pending charges can be reviewed.", 409);
  const { decision, reason = "" } = req.body || {};
  if (!["approve", "decline"].includes(decision)) return bad(res, "Choose approve or decline.");
  if (decision === "approve" && charge.customer_chargeable !== true) return bad(res, "This charge has not been assessed as payable by the customer.", 409);
  if (decision === "decline" && !String(reason).trim()) return bad(res, "A reason is required when declining a charge.");
  charge.status = decision === "approve" ? "Approved" : "Declined";
  charge.decline_reason = decision === "decline" ? String(reason).trim() : "";
  charge.approved_by = decision === "approve" ? req.user.id : null;
  charge.approved_by_name = decision === "approve" ? staffName(req.user) : "";
  charge.approved_at = decision === "approve" ? new Date() : null;
  charge.approval_history.push({ action: decision, reason: String(reason).trim(), by: req.user.id, by_name: staffName(req.user) });
  try { await charge.save(); }
  catch (error) { if (error?.name === "VersionError") return bad(res, "This charge changed while it was being reviewed. Refresh and try again.", 409); throw error; }
  if (decision === "approve") {
    const order = await Order.findById(req.params.orderId).select("customer tracking").lean();
    await notifyCustomer(order, "extra_charge_update", "Extra charge approved", `${charge.description}: ${amount(charge.total).toFixed(2)}. Reason: ${charge.reason}`, `extra-charge:${charge._id}:approved`);
  }
  res.json({ success: true, charge });
};

export const issueExtraChargeReceipt = async (req, res) => {
  const { orderId, chargeId } = req.params;
  if (!validId(orderId) || !validId(chargeId)) return bad(res, "Invalid charge reference.");
  const charge = await ExtraCharge.findOne({ _id: chargeId, order: orderId });
  if (!charge) return bad(res, "Extra charge not found.", 404);
  if (charge.receipt) return bad(res, "A receipt has already been issued for this charge.", 409);
  if (charge.status !== "Approved" || charge.customer_chargeable !== true || !(charge.total > 0)) return bad(res, "Only assessed, approved charges with a valid amount can receive a receipt.", 409);
  const order = await Order.findById(orderId);
  if (!order) return bad(res, "Project not found.", 404);
  const amounts = getOrderPaymentAmounts(order);
  const originalOutstanding = Math.max(amount(amounts.totalAmount - verifiedOriginalPayments(order)), 0);
  const otherApprovedCharges = await ExtraCharge.find({ order: order._id, _id: { $ne: charge._id }, status: { $in: ["Approved", "Receipt Generated"] } }).select("total payments").lean();
  const otherChargeOutstanding = otherApprovedCharges.reduce((sum, extraCharge) => {
    const paid = (extraCharge.payments || []).filter((payment) => payment.status === "verified").reduce((subtotal, payment) => subtotal + Number(payment.amount || 0), 0);
    return sum + Math.max(Number(extraCharge.total || 0) - paid, 0);
  }, 0);
  const previousOutstanding = amount(originalOutstanding + otherChargeOutstanding);
  let receipt;
  try {
    receipt = await ExtraChargeReceipt.create({ receipt_number: `EC-${new Date().getFullYear()}-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`, order: order._id, extra_charge: charge._id, customer_name: order.customer_name, customer_contact: order.customer_phone || order.customer_email, project_reference: order.tracking, item_index: charge.item_index, affected_item: charge.item_index === null || charge.item_index === undefined ? "Project installation" : order.items[charge.item_index]?.name || `Item ${Number(charge.item_index) + 1}`, items: charge.items.map((item) => item.toObject()), description: charge.description, reason: charge.reason, total: charge.total, previous_outstanding: previousOutstanding, updated_outstanding_at_issue: amount(previousOutstanding + charge.total), issued_by: req.user.id, issued_by_name: staffName(req.user) });
  } catch (error) {
    if (error?.code === 11000) return bad(res, "A receipt has already been issued for this charge.", 409);
    throw error;
  }
  charge.receipt = receipt._id;
  charge.status = "Receipt Generated";
  charge.approval_history.push({ action: "receipt_issued", by: req.user.id, by_name: staffName(req.user) });
  try { await charge.save(); }
  catch (error) {
    if (error?.name === "VersionError") { await ExtraChargeReceipt.deleteOne({ _id: receipt._id }); return bad(res, "This charge changed while its receipt was being issued. Refresh and try again.", 409); }
    throw error;
  }
  await notifyCustomer(order, "extra_charge_update", "Extra charge receipt issued", `Receipt ${receipt.receipt_number} was issued for ${amount(receipt.total).toFixed(2)}. Payment is still ${receipt.total > 0 ? "unpaid until verified payments are recorded" : "unpaid"}.`, `extra-charge:${charge._id}:receipt`);
  res.status(201).json({ success: true, receipt, charge, original_payment_summary: amounts });
};

export const recordExtraChargePayment = async (req, res) => {
  if (!validId(req.params.orderId) || !validId(req.params.chargeId)) return bad(res, "Invalid charge reference.");
  const charge = await ExtraCharge.findOne({ _id: req.params.chargeId, order: req.params.orderId });
  if (!charge || !charge.receipt) return bad(res, "An issued extra charge receipt is required before payment recording.", 409);
  const { request_id, amount: rawAmount, method = "Cash", reference = "", action = "record" } = req.body || {};
  const paymentAmount = amount(rawAmount);
  if (!request_id || String(request_id).length > 120 || !Number.isFinite(paymentAmount) || paymentAmount <= 0) return bad(res, "A unique request ID and positive payment amount are required.");
  if (charge.payments.some((payment) => payment.request_id === request_id)) return res.json({ success: true, duplicate: true, charge });
  const verified = amount(charge.payments.filter((payment) => payment.status === "verified").reduce((sum, payment) => sum + payment.amount, 0));
  if (paymentAmount > amount(charge.total - verified)) return bad(res, "Payment exceeds the remaining charge balance.", 409);
  if (!["record", "verify"].includes(action)) return bad(res, "Invalid payment action.");
  charge.payments.push({ request_id, amount: paymentAmount, method, reference, recorded_by: req.user.id, ...(action === "verify" ? { status: "verified", verified_by: req.user.id, verified_at: new Date() } : {}) });
  try { await charge.save(); }
  catch (error) {
    if (error?.name === "VersionError") {
      const latest = await ExtraCharge.findById(charge._id);
      if (latest?.payments.some((payment) => payment.request_id === request_id)) return res.json({ success: true, duplicate: true, charge: latest });
      return bad(res, "The charge changed while recording payment. Refresh and retry.", 409);
    }
    throw error;
  }
  res.status(201).json({ success: true, charge });
};

export const verifyExtraChargePayment = async (req, res) => {
  if (!validId(req.params.orderId) || !validId(req.params.chargeId) || !validId(req.params.paymentId)) return bad(res, "Invalid payment reference.");
  const charge = await ExtraCharge.findOne({ _id: req.params.chargeId, order: req.params.orderId });
  if (!charge) return bad(res, "Extra charge not found.", 404);
  const payment = charge.payments.id(req.params.paymentId);
  if (!payment) return bad(res, "Payment not found.", 404);
  if (payment.status !== "pending") return bad(res, "Only pending payments can be verified.", 409);
  const verified = charge.payments.filter((entry) => entry.status === "verified").reduce((sum, entry) => sum + entry.amount, 0);
  if (payment.amount > amount(charge.total - verified)) return bad(res, "Payment would exceed the remaining charge balance.", 409);
  payment.status = "verified";
  payment.verified_by = req.user.id;
  payment.verified_at = new Date();
  try { await charge.save(); }
  catch (error) { if (error?.name === "VersionError") return bad(res, "The charge changed while verifying payment. Refresh and retry.", 409); throw error; }
  res.json({ success: true, charge });
};
