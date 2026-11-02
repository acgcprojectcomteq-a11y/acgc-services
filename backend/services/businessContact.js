import Admin from "../models/Admin.js";
import User from "../models/User.js";

export const getAdminPublicContact = async () => {
  const username = String(process.env.ADMIN_RECOVERY_USERNAME || "").trim().toLowerCase();
  let account = null;
  if (username) {
    account = await Admin.findOne({ username, is_active: { $ne: false } }).select("email phone street_address city province zip_code").lean();
  }
  const preferredAccount = account;
  if (!String(account?.phone || "").trim()) {
    account = await Admin.findOne({
      is_active: { $ne: false },
      phone: { $regex: /\S/ },
    }).sort({ updatedAt: -1, _id: 1 }).select("email phone street_address city province zip_code").lean();
  }
  if (!String(account?.phone || "").trim()) {
    account = await User.findOne({
      role: "admin",
      is_active: { $ne: false },
      phone: { $regex: /\S/ },
    }).sort({ updatedAt: -1, _id: 1 }).select("email phone street_address city province zip_code").lean();
  }
  const preferredAddress = [preferredAccount?.street_address, preferredAccount?.city, preferredAccount?.province, preferredAccount?.zip_code]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const addressAccount = preferredAddress.length ? preferredAccount : account;
  const email = String(preferredAccount?.email || account?.email || "").trim();
  const streetAddress = String(addressAccount?.street_address || "").trim();
  return {
    email,
    phone: String(account?.phone || "").trim(),
    address: streetAddress || [addressAccount?.city, addressAccount?.province, addressAccount?.zip_code]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", "),
  };
};
