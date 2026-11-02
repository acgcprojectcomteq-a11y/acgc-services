const toNonNegativeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
};

export const isProjectPriceLocked = (order = {}) => {
  const status = String(order.status || "").toLowerCase();
  const contractStatus = String(order.contract_status || "").toLowerCase();
  const paymentStatus = String(order.payment_status || "").toLowerCase();
  return order.acceptedByCustomer === true
    || status === "contract_accepted"
    || contractStatus === "accepted"
    || toNonNegativeAmount(order.amount_paid) > 0
    || order.downpayment_received === true
    || Boolean(order.payment_proof_confirmed_at)
    || paymentStatus === "paid"
    || paymentStatus === "partial";
};

export const getInstallationExtraChargeTotal = (order = {}) => {
  const recordedTotal = toNonNegativeAmount(order.installation_extra_charge_total);
  const receiptTotal = Array.isArray(order.extra_charge_receipts)
    ? order.extra_charge_receipts.reduce((sum, receipt) => sum + toNonNegativeAmount(receipt?.total), 0)
    : 0;
  return toNonNegativeAmount(Math.max(recordedTotal, Math.round(receiptTotal * 100) / 100));
};

export const getFinalProjectCost = (order = {}) => {
  const manualOverride = toNonNegativeAmount(order.manual_override);
  const savedFinalCost = toNonNegativeAmount(order.final_project_cost);
  const contractAmount = toNonNegativeAmount(order.contract_amount);
  const baseCost = manualOverride > 0
    ? manualOverride
    : savedFinalCost > 0
      ? savedFinalCost
      : contractAmount > 0
        ? contractAmount
        : toNonNegativeAmount(order.total_amount ?? order.totalAmount ?? order.total);
  return toNonNegativeAmount(baseCost + getInstallationExtraChargeTotal(order));
};

export const calculateRequiredDownpayment = (projectCost, paymentTerms, configuredAmount) => {
  const total = toNonNegativeAmount(projectCost);
  const terms = String(paymentTerms || "").trim().toLowerCase();

  if (terms === "full_payment") return total;
  if (terms === "50%_down_payment") return Math.round(total * 50) / 100;

  const configured = Number(configuredAmount);
  const required = Number.isFinite(configured) && configured > 0
    ? configured
    : total * 0.5;

  return Math.min(total, Math.max(Math.round(required * 100) / 100, 0));
};

export const getRequiredDownpayment = (order = {}) => calculateRequiredDownpayment(
  getFinalProjectCost(order),
  order.payment_terms,
  order.required_downpayment_amount ?? order.downpayment_amount,
);
