import { getFinalProjectCost, getInstallationExtraChargeTotal, getRequiredDownpayment } from "../../src/lib/orderPricing.js";

const toCents = (value) => Math.round((Number(value) || 0) * 100);
const fromCents = (value) => value / 100;

const hasMatchingPaymentIdentity = (first, second) => {
  if (toCents(first?.submitted_amount ?? first?.verified_amount) !== toCents(second?.submitted_amount ?? second?.verified_amount)) {
    return false;
  }
  const firstProofUrl = String(first?.proof_file_url || "").trim();
  const secondProofUrl = String(second?.proof_file_url || "").trim();
  const firstTransactionNumber = String(first?.transaction_number || "").trim().toLowerCase();
  const secondTransactionNumber = String(second?.transaction_number || "").trim().toLowerCase();
  const firstProofNames = [first?.proof_file_name, ...(first?.supporting_documents || []).map((document) => document.original_name)]
    .map((name) => String(name || "").trim().toLowerCase())
    .filter(Boolean);
  const secondProofNames = [second?.proof_file_name, ...(second?.supporting_documents || []).map((document) => document.original_name)]
    .map((name) => String(name || "").trim().toLowerCase())
    .filter(Boolean);
  return Boolean(
    (firstProofUrl && secondProofUrl && firstProofUrl === secondProofUrl) ||
    (firstTransactionNumber && secondTransactionNumber && firstTransactionNumber === secondTransactionNumber) ||
    firstProofNames.some((name) => secondProofNames.includes(name))
  );
};

export const getOrderPaymentAmounts = (order = {}) => {
  const totalAmount = getFinalProjectCost(order);
  const requiredAmount = getRequiredDownpayment(order);
  const records = Array.isArray(order.payment_records) ? order.payment_records : [];
  let paidAmount;

  if (order.payment_ledger_initialized || records.length > 0) {
    const legacyPaid = Math.max(0, Number(order.legacy_verified_amount) || 0);
    const verifiedRecords = records.reduce((sum, record) => (
      record.status === "verified" ? sum + Math.max(0, Number(record.verified_amount) || 0) : sum
    ), 0);
    paidAmount = legacyPaid + verifiedRecords;
  } else if (order.amount_paid !== undefined && order.amount_paid !== null && Number.isFinite(Number(order.amount_paid))) {
    paidAmount = Number(order.amount_paid);
  } else if (order.payment_proof_confirmed_at) {
    paidAmount = Number(order.payment_proof_amount) || 0;
  } else if (order.payment_status === "paid" && !order.payment_proof_submitted_at) {
    paidAmount = Math.max(totalAmount - getInstallationExtraChargeTotal(order), 0);
  } else if (order.downpayment_received) {
    paidAmount = getRequiredDownpayment({ ...order, installation_extra_charge_total: 0 });
  } else {
    paidAmount = 0;
  }

  paidAmount += Math.max(0, Number(order.installation_extra_charge_paid_total) || 0);
  paidAmount = Math.min(Math.max(paidAmount, 0), totalAmount);
  const remainingAmount = Math.max(totalAmount - paidAmount, 0);
  const downpaymentRemaining = Math.max(requiredAmount - paidAmount, 0);
  return { totalAmount, requiredAmount, paidAmount, remainingAmount, downpaymentRemaining };
};

export const getOrderPaymentStatus = (order = {}) => {
  const { totalAmount, requiredAmount, paidAmount } = getOrderPaymentAmounts(order);
  if (toCents(totalAmount) > 0 && toCents(paidAmount) >= toCents(totalAmount)) return "paid";
  if (toCents(paidAmount) <= 0) return "pending";
  if (order.payment_terms === "full_payment") return "partial";
  if (toCents(paidAmount) < toCents(requiredAmount)) return "partial_downpayment";
  if (toCents(paidAmount) === toCents(requiredAmount)) return "downpayment";
  return "partial";
};

export const initializePaymentLedger = (order) => {
  order.payment_records = Array.isArray(order.payment_records) ? order.payment_records : [];
  const verifiedRecords = order.payment_records.filter((record) => record.status === "verified");
  let removedDuplicate = false;
  for (let index = order.payment_records.length - 1; index >= 0; index -= 1) {
    const record = order.payment_records[index];
    if (record.status === "pending" && verifiedRecords.some((verified) => hasMatchingPaymentIdentity(record, verified))) {
      order.payment_records.splice(index, 1);
      removedDuplicate = true;
    }
  }
  if (removedDuplicate) order.markModified?.("payment_records");
  if (order.payment_ledger_initialized) return;
  const previousPaid = getOrderPaymentAmounts(order).paidAmount;
  const verifiedRecordAmount = verifiedRecords.reduce((sum, record) => sum + Math.max(0, Number(record.verified_amount) || 0), 0);
  const extraChargePaidAmount = Math.max(0, Number(order.installation_extra_charge_paid_total) || 0);
  order.legacy_verified_amount = Math.max(previousPaid - verifiedRecordAmount - extraChargePaidAmount, 0);
  order.payment_ledger_initialized = true;
  if (
    order.payment_proof_submitted_at &&
    !order.payment_proof_confirmed_at &&
    Number(order.payment_proof_amount) > 0 &&
    !verifiedRecords.some((record) => hasMatchingPaymentIdentity({
      submitted_amount: order.payment_proof_amount,
      proof_file_url: order.payment_proof_file_url,
      transaction_number: order.transaction_number,
    }, record)) &&
    !order.payment_records.some((record) => record.status === "pending")
  ) {
    order.payment_records.push({
      submitted_amount: Number(order.payment_proof_amount),
      status: "pending",
      payment_method: order.payment_method || "Cash",
      transaction_number: order.transaction_number || "",
      proof_file_name: order.payment_proof_file_name || "",
      proof_file_url: order.payment_proof_file_url || "",
      submitted_at: order.payment_proof_submitted_at,
    });
  }
  order.amount_paid = previousPaid;
};

export const validatePaymentAmount = (value, remainingAmount, minimumAmount = 0) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) {
    return { valid: false, amount: 0, message: "Please enter a valid payment amount greater than zero, with up to two decimal places." };
  }
  const cents = toCents(amount);
  if (cents > toCents(remainingAmount)) {
    return { valid: false, amount, message: "Payment cannot exceed the remaining project balance." };
  }
  if (cents < toCents(minimumAmount)) {
    return { valid: false, amount, message: "Payment must cover the remaining required downpayment." };
  }
  return { valid: true, amount: fromCents(cents), message: "" };
};

export const isPaymentDiscrepancy = (submittedAmount, verifiedAmount) => (
  toCents(submittedAmount) !== toCents(verifiedAmount)
);

export const getDownpaymentExceptionSummary = (order, acceptedAmount, replacedVerifiedAmount = 0) => {
  const { totalAmount, requiredAmount, paidAmount } = getOrderPaymentAmounts(order);
  const projectedPaidAmount = Math.min(
    Math.max(paidAmount - Math.max(Number(replacedVerifiedAmount) || 0, 0) + Math.max(Number(acceptedAmount) || 0, 0), 0),
    totalAmount,
  );
  const shortfall = Math.max(requiredAmount - projectedPaidAmount, 0);

  return {
    requiredAmount,
    acceptedAmount: Math.max(Number(acceptedAmount) || 0, 0),
    totalPaidAtApproval: projectedPaidAmount,
    shortfall,
    eligible: acceptedAmount > 0 && requiredAmount > 0 && toCents(projectedPaidAmount) < toCents(requiredAmount),
  };
};

export const validateDownpaymentExceptionAcceptance = (
  order,
  paymentAmount,
  replacedVerifiedAmount = 0,
  explicitlyAccepted = false,
) => {
  const summary = getDownpaymentExceptionSummary(order, paymentAmount, replacedVerifiedAmount);
  if (summary.eligible && !explicitlyAccepted) {
    return {
      valid: false,
      requiresAcceptance: true,
      message: "Warning: Payment is below the required downpayment amount. Please contact the seller to confirm whether this lower payment can be accepted before proceeding.",
      summary,
    };
  }
  if (explicitlyAccepted && !summary.eligible) {
    return {
      valid: false,
      requiresAcceptance: false,
      message: "A downpayment exception is not needed because this payment covers the remaining required downpayment.",
      summary,
    };
  }
  return { valid: true, requiresAcceptance: summary.eligible, summary };
};

export const validateDownpaymentExceptionApproval = ({
  explicitlyAccepted = false,
  sellerApprovalConfirmed = false,
  sellerApprovalParty = "",
  reason = "",
} = {}) => {
  if (!explicitlyAccepted) return { valid: true, message: "" };
  if (sellerApprovalConfirmed !== true) {
    return { valid: false, message: "Confirm that the seller approved this lower payment before proceeding." };
  }
  if (!String(sellerApprovalParty).trim()) {
    return { valid: false, message: "Record the seller or authorized party who approved this lower payment." };
  }
  if (String(sellerApprovalParty).trim().length > 200) {
    return { valid: false, message: "The seller approval name must be 200 characters or fewer." };
  }
  if (!String(reason).trim()) {
    return { valid: false, message: "Provide a reason for accepting a payment below the required downpayment." };
  }
  if (String(reason).trim().length > 1000) {
    return { valid: false, message: "The exception reason must be 1000 characters or fewer." };
  }
  return { valid: true, message: "" };
};
