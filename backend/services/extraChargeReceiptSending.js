import { getOrderPaymentAmounts } from "./paymentLedger.js";

const cents = (value) => Math.round((Number(value) || 0) * 100);
const money = (value) => Math.max(0, Number(value) || 0);
const roundMoney = (value) => Math.round(money(value) * 100) / 100;

export const getVerifiedExtraChargeReceiptBalance = (order, approvedCharges = []) => {
  const originalOrder = {
    ...order,
    extra_charge_receipts: [],
    installation_extra_charge_total: 0,
    installation_extra_charge_paid_total: 0,
  };
  const originalTotal = roundMoney(getOrderPaymentAmounts(originalOrder).totalAmount);
  const records = Array.isArray(order?.payment_records) ? order.payment_records : [];
  let originalVerifiedPayments;

  if (order?.payment_ledger_initialized || records.length > 0) {
    originalVerifiedPayments = money(order?.legacy_verified_amount) + records.reduce((sum, record) => (
      record?.status === "verified" ? sum + money(record.verified_amount) : sum
    ), 0);
  } else {
    // amount_paid is the legacy admin-recorded amount. An uploaded proof amount
    // is deliberately not used unless the order records that it was confirmed.
    originalVerifiedPayments = money(order?.amount_paid);
    if (order?.payment_proof_confirmed_at) {
      originalVerifiedPayments = Math.max(originalVerifiedPayments, money(order?.payment_proof_amount));
    }
  }
  const hasUnverifiedOriginalPayment = records.some((record) => record?.status === "pending")
    || Boolean(order?.payment_proof_submitted_at && !order?.payment_proof_confirmed_at && records.length === 0);
  originalVerifiedPayments = roundMoney(Math.min(originalVerifiedPayments, originalTotal));

  const approvedExtraChargeTotal = roundMoney(approvedCharges.reduce((sum, charge) => sum + money(charge.total), 0));
  const recordedExtraChargeTotal = roundMoney(Math.max(
    approvedExtraChargeTotal,
    money(order?.installation_extra_charge_total),
  ));
  const verifiedChargePaymentTotal = roundMoney(approvedCharges.reduce((sum, charge) => (
    sum + (charge.payments || []).reduce((paymentSum, payment) => (
      payment?.status === "verified" ? paymentSum + money(payment.amount) : paymentSum
    ), 0)
  ), 0));
  const hasUnverifiedExtraChargePayment = approvedCharges.some((charge) => (
    (charge.payments || []).some((payment) => payment?.status === "pending")
  ));
  const recordedVerifiedExtraPaymentTotal = roundMoney(Math.max(
    verifiedChargePaymentTotal,
    money(order?.installation_extra_charge_paid_total),
  ));

  const totalProjectCharges = roundMoney(originalTotal + recordedExtraChargeTotal);
  // Use the same project-wide ledger calculation shown in Transactions. A
  // verified payment record may cover the original contract and an added
  // installation charge together, so do not cap it at the original contract
  // amount before checking the full project balance.
  const projectPaymentSummary = getOrderPaymentAmounts({
    ...order,
    extra_charge_receipts: [],
    installation_extra_charge_total: recordedExtraChargeTotal,
    installation_extra_charge_paid_total: recordedVerifiedExtraPaymentTotal,
  });
  const totalVerifiedPayments = roundMoney(Math.min(totalProjectCharges, projectPaymentSummary.paidAmount));
  const remainingBalance = roundMoney(Math.max(totalProjectCharges - totalVerifiedPayments, 0));
  const hasUnverifiedPayments = hasUnverifiedOriginalPayment || hasUnverifiedExtraChargePayment;

  return {
    original_total: originalTotal,
    original_verified_payments: originalVerifiedPayments,
    approved_extra_charges: recordedExtraChargeTotal,
    verified_extra_charge_payments: recordedVerifiedExtraPaymentTotal,
    total_project_charges: totalProjectCharges,
    total_verified_payments: totalVerifiedPayments,
    remaining_balance: remainingBalance,
    has_unverified_payments: hasUnverifiedPayments,
    fully_paid: cents(remainingBalance) === 0 && !hasUnverifiedPayments,
  };
};

export const providerAcceptedRecipient = (result, recipientEmail) => {
  const target = String(recipientEmail || "").trim().toLowerCase();
  if (!target || !result || result.rejected?.some((entry) => String(entry?.address || entry || "").trim().toLowerCase() === target)) return false;
  if (String(result.provider || "").toLowerCase() === "brevo") return Boolean(String(result.messageId || "").trim());
  return Array.isArray(result.accepted) && result.accepted.some((entry) => (
    String(entry?.address || entry || "").trim().toLowerCase() === target
  ));
};
