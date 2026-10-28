import jwt from "jsonwebtoken";
import process from "node:process";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import SystemSetting from "../models/SystemSetting.js";
import { isCustomerPermissionEnabled } from "../services/customerPermissions.js";
import { STAFF_MODULE_ACTIONS } from "../../shared/staffPermissions.js";

/**
 * Authentication Middleware
 * Verifies JWT token from Authorization header
 */
export const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    let account;
    if (decoded.auth_source === "admin") {
      account = await Admin.findById(decoded.id).select("session_version email first_name last_name phone role is_active").lean();
    } else if (decoded.auth_source === "user") {
      account = await User.findById(decoded.id).select("session_version email first_name last_name phone role is_active").lean();
    } else if (decoded.role === "admin") {
      account = await Admin.findById(decoded.id).select("session_version email first_name last_name phone role is_active").lean()
        || await User.findById(decoded.id).select("session_version email first_name last_name phone role is_active").lean();
    } else {
      account = await User.findById(decoded.id).select("session_version email first_name last_name phone role is_active").lean();
    }

    if (!account || account.is_active === false || Number(decoded.session_version || 0) !== Number(account.session_version || 0)) {
      return res.status(401).json({
        success: false,
        code: "SESSION_REVOKED",
        message: "Your session is no longer valid. Please sign in again.",
      });
    }

    // Attach user info to request
    req.user = { ...decoded, ...account, id: decoded.id, role: decoded.role || account.role };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

export const optionalAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  return authMiddleware(req, res, next);
};

/**
 * Role Check Middleware
 * Verifies user has required role
 */
export const roleMiddleware = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const roles = Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles];

    const isSuperAdminForAdminRoute = req.user.role === "super_admin" && roles.includes("admin");
    if (!roles.includes(req.user.role) && !isSuperAdminForAdminRoute) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

export const staffModulePermission = (moduleFromRequest, action = "view") => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Not authenticated" });
    if (["admin", "super_admin"].includes(req.user.role)) return next();
    if (req.user.role !== "skilled_worker") {
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const moduleKey = typeof moduleFromRequest === "function" ? moduleFromRequest(req) : moduleFromRequest;
    const actionKey = typeof action === "function" ? action(req) : action;
    if (typeof moduleKey !== "string" || !STAFF_MODULE_ACTIONS[moduleKey]?.includes(actionKey)) {
      return res.status(403).json({ success: false, message: "This staff module or action is disabled for your account." });
    }
    const user = await User.findById(req.user.id).select("staff_access role is_active").lean();
    if (!user || user.role !== "skilled_worker" || user.is_active === false) {
      return res.status(403).json({ success: false, message: "This staff module or action is disabled for your account." });
    }
    const moduleAccess = user?.staff_access?.modules?.[moduleKey];
    if (moduleAccess?.enabled !== true || moduleAccess.actions?.[actionKey] !== true) {
      return res.status(403).json({ success: false, message: "This staff module or action is disabled for your account." });
    }

    req.staffAccessModule = moduleKey;
    req.staffAccessAction = actionKey;
    req.staffAccess = user.staff_access;
    next();
  } catch (error) {
    console.error("Staff module permission error:", error);
    res.status(500).json({ success: false, message: "Unable to verify staff access." });
  }
};

export const staffModulePermissionIfStaff = (moduleKey, action = "view") => (req, res, next) => {
  if (req.user?.role !== "skilled_worker") return next();
  return staffModulePermission(moduleKey, action)(req, res, next);
};

export const staffModulePermissionAny = (moduleKey, actions = []) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Not authenticated" });
  if (["admin", "super_admin"].includes(req.user.role)) return next();
  if (req.user.role !== "skilled_worker") return res.status(403).json({ success: false, message: "Insufficient permissions" });
  try {
    const user = await User.findById(req.user.id).select("staff_access role is_active").lean();
    const moduleAccess = user?.staff_access?.modules?.[moduleKey];
    const allowed = STAFF_MODULE_ACTIONS[moduleKey] || [];
    if (!user || user.role !== "skilled_worker" || user.is_active === false || moduleAccess?.enabled !== true
      || !actions.some((action) => allowed.includes(action) && moduleAccess.actions?.[action] === true)) {
      return res.status(403).json({ success: false, message: "This staff module or action is disabled for your account." });
    }
    req.staffAccessModule = moduleKey;
    req.staffAccess = user.staff_access;
    return next();
  } catch (error) {
    console.error("Staff module permission error:", error);
    return res.status(500).json({ success: false, message: "Unable to verify staff access." });
  }
};

export const permissionMiddleware = (permission) => async (req, res, next) => {
  try {
    if (req.user && req.user.role !== "customer") return next();

    const [user, settings] = await Promise.all([
      req.user ? User.findById(req.user.id).select("access_permissions").lean() : Promise.resolve(null),
      SystemSetting.findOne({ key: "global" }).select("global_permissions").lean(),
    ]);
    const allowed = isCustomerPermissionEnabled(
      permission,
      user?.access_permissions || {},
      settings?.global_permissions || {}
    );
    if (!allowed) {
      return res.status(403).json({ success: false, message: "This action is disabled for your account." });
    }
    next();
  } catch (error) {
    console.error("Permission middleware error:", error);
    res.status(500).json({ success: false, message: "Unable to verify account permissions." });
  }
};
