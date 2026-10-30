export const FULL_ADDRESS_MIN_LENGTH = 50;
export const FULL_ADDRESS_MAX_LENGTH = 100;

export const normalizeFullAddress = (value) => String(value ?? "").trim();

export const getFullAddressError = (value) => {
  const address = normalizeFullAddress(value);
  if (address.length < FULL_ADDRESS_MIN_LENGTH) return "Full address must contain at least 50 characters.";
  if (address.length > FULL_ADDRESS_MAX_LENGTH) return "Full address cannot exceed 100 characters.";
  return "";
};

export const isValidFullAddress = (value) => !getFullAddressError(value);
