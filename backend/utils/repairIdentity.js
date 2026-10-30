export const ACTIVE_REPAIR_STATUSES = Object.freeze([
  "pending_review",
  "quotation_pending_approval",
  "customer_accepted",
  "admin_approved",
  "scheduled",
  "in_progress",
]);

export const buildActiveRepairKey = ({ customer, order, productIndex, status }) => {
  if (!customer || !order || !Number.isInteger(Number(productIndex)) || !ACTIVE_REPAIR_STATUSES.includes(status)) return undefined;
  return `${customer}:${order}:${Number(productIndex)}`;
};
