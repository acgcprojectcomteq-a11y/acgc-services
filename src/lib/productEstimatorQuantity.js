export const MAX_PRODUCT_ESTIMATOR_QUANTITY = 100;

export const getProductEstimatorQuantityError = (value) => {
  const quantity = Number(value);
  if (quantity > MAX_PRODUCT_ESTIMATOR_QUANTITY) {
    return "Maximum quantity allowed is 100.";
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Quantity must be a whole number from 1 to 100.";
  }
  return "";
};

export const isValidProductEstimatorQuantity = (value) =>
  !getProductEstimatorQuantityError(value);
