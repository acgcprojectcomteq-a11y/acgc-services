export const STAFF_MODULES = [
  { key: "dashboard", label: "Dashboard", actions: [{ key: "view", label: "View", enabled: true }] },
  { key: "site_inspection", label: "Site Inspection", enabled: false, actions: [{ key: "view", label: "View" }, { key: "view_details", label: "View Details" }, { key: "edit", label: "Edit" }, { key: "cancel", label: "Cancel" }, { key: "generate_contract", label: "Generate Contract" }, { key: "send_email", label: "Send Email" }, { key: "download_contract", label: "Download Contract" }, { key: "manual_approve", label: "Manual Approve" }] },
  { key: "transactions", label: "Transactions", actions: [{ key: "view", label: "View", enabled: true }, { key: "view_details", label: "View Details", enabled: true }, { key: "edit", label: "Edit" }, { key: "view_contract", label: "View Contract" }, { key: "download_contract", label: "Download Contract" }, { key: "send_email", label: "Send Email" }] },
  { key: "progress_monitoring", label: "Progress Monitoring", actions: [{ key: "view", label: "View", enabled: true }, { key: "view_details", label: "View Details", enabled: true }, { key: "edit", label: "Edit" }, { key: "upload_progress_photo", label: "Upload Progress Photos" }, { key: "delete_proof", label: "Delete Proof" }] },
  { key: "repair_management", label: "Repair Management", enabled: false, actions: [{ key: "view", label: "View", enabled: true }, { key: "create", label: "Create Repair Tickets" }, { key: "manage", label: "Manage Repairs" }] },
  { key: "product_management", label: "Product Management", actions: [{ key: "view", label: "View", enabled: true }, { key: "add", label: "Add" }, { key: "edit", label: "Edit" }, { key: "delete", label: "Delete" }] },
  { key: "profile", label: "Profile", actions: [{ key: "view", label: "View", enabled: true }, { key: "edit", label: "Edit" }] },
  { key: "settings", label: "Settings", actions: [{ key: "view", label: "View", enabled: true }, { key: "manage_access", label: "Manage Access" }, { key: "back_up", label: "Back Up" }] },
];

export const STAFF_MODULE_ACTIONS = Object.fromEntries(
  STAFF_MODULES.map(({ key, actions }) => [key, actions.map(({ key: actionKey }) => actionKey)]),
);
export const STAFF_MODULE_KEYS = STAFF_MODULES.map(({ key }) => key);
export const STAFF_TYPES = ["skilled_worker", "helper"];

export const STAFF_DEFAULT_ENABLED_ACTIONS = {
  dashboard: ["view"],
  product_management: ["view"],
  site_inspection: [],
  repair_management: ["view"],
  progress_monitoring: ["view", "view_details"],
  transactions: ["view", "view_details"],
  settings: ["view"],
  profile: ["view"],
};

export const createDefaultStaffAccess = (staffType = "") => ({
  profile_version: 2,
  staff_type: STAFF_TYPES.includes(staffType) ? staffType : "",
  subrole: "Helper",
  custom_subroles: [],
  hide_payment_amounts: false,
  modules: Object.fromEntries(STAFF_MODULES.map(({ key, enabled = true }) => [key, {
    enabled,
    actions: Object.fromEntries(STAFF_MODULE_ACTIONS[key].map((actionKey) => [
      actionKey,
      STAFF_DEFAULT_ENABLED_ACTIONS[key].includes(actionKey),
    ])),
  }])),
});

export const normalizeStaffAccess = (staffAccess = {}) => {
  const input = staffAccess && typeof staffAccess === "object" && !Array.isArray(staffAccess) ? staffAccess : {};
  const modules = Object.fromEntries(STAFF_MODULES.map(({ key }) => {
    const moduleAccess = input.modules?.[key];
    return [key, {
      enabled: moduleAccess?.enabled === true,
      actions: Object.fromEntries(STAFF_MODULE_ACTIONS[key].map((actionKey) => [
        actionKey,
        moduleAccess?.actions?.[actionKey] === true,
      ])),
    }];
  }));

  return {
    profile_version: 2,
    staff_type: STAFF_TYPES.includes(input.staff_type) ? input.staff_type : "",
    subrole: typeof input.subrole === "string" && input.subrole.trim() ? input.subrole.trim() : "Helper",
    hide_payment_amounts: input.hide_payment_amounts === true,
    custom_subroles: Array.isArray(input.custom_subroles)
      ? [...new Set(input.custom_subroles.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20)
      : [],
    modules,
  };
};

export const hasStaffModulePermission = (user, moduleKey, actionKey) => {
  if (["admin", "super_admin"].includes(user?.role)) return true;
  if (user?.role !== "skilled_worker") return false;
  if (!STAFF_MODULE_ACTIONS[moduleKey]?.includes(actionKey)) return false;
  const moduleAccess = user.staff_access?.modules?.[moduleKey];
  return moduleAccess?.enabled === true && moduleAccess.actions?.[actionKey] === true;
};
