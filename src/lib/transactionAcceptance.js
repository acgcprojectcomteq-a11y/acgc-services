const getAcceptanceMethod = (order) => {
  const storedMethod = String(order?.acceptance_method || "").trim().toLowerCase();
  if (storedMethod) return storedMethod;

  const legacyMethod = String(order?.acceptanceMethod || "").trim().toLowerCase();
  if (legacyMethod.includes("walk-in") && legacyMethod.includes("signed")) return "walk_in_signed_contract";
  if (legacyMethod.startsWith("online")) return "online";
  return legacyMethod.replaceAll("-", "_").replaceAll(" ", "_");
};

export const hasAcceptedTransactionContract = (order) => {
  if (String(order?.contract_status || "").toLowerCase() !== "accepted") return false;

  if (order.order_type === "walk_in_customer") {
    return getAcceptanceMethod(order) === "walk_in_signed_contract"
      && Boolean(order.signed_contract_url)
      && Boolean(order.contract_signed_date);
  }

  return getAcceptanceMethod(order) === "online" && order.acceptedByCustomer === true;
};

