export const CUSTOMER_PERMISSION_KEYS = [
  "can_request_orders",
  "can_estimate_pricing",
  "view_only_access",
  "can_track_products",
  "can_upload_feedback",
  "show_ratings_homepage",
];

export const defaultCustomerPermissions = () => Object.fromEntries(
  CUSTOMER_PERMISSION_KEYS.map((key) => [key, key !== "view_only_access"])
);

export const normalizeGlobalCustomerPermissions = (permissions = {}) => {
  const normalized = {
    ...defaultCustomerPermissions(),
    ...(permissions || {}),
  };
  const customerFeatureKeys = [
    "can_request_orders",
    "can_estimate_pricing",
    "can_track_products",
    "can_upload_feedback",
    "show_ratings_homepage",
  ];
  const hasAnyCustomerFeature = customerFeatureKeys.some((key) => normalized[key] === true);

  if (!hasAnyCustomerFeature) normalized.view_only_access = true;

  return normalized;
};

export const getApplicableGlobalCustomerPermissions = (role, permissions = {}) => (
  role && role !== "customer"
    ? defaultCustomerPermissions()
    : normalizeGlobalCustomerPermissions(permissions)
);

export const resolveCustomerPermissions = (accountPermissions = {}, globalPermissions = {}) => {
  const account = {
    ...defaultCustomerPermissions(),
    ...(accountPermissions || {}),
  };
  const global = normalizeGlobalCustomerPermissions(globalPermissions);
  const viewOnly = account.view_only_access === true || global.view_only_access === true;

  return Object.fromEntries(CUSTOMER_PERMISSION_KEYS.map((key) => [
    key,
    key === "view_only_access"
      ? viewOnly
      : !viewOnly && account[key] !== false && global[key] !== false,
  ]));
};
