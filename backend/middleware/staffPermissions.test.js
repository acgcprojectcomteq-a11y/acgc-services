import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import { staffModulePermission } from "./auth.js";
import {
  STAFF_MODULES,
  STAFF_MODULE_ACTIONS,
  createDefaultStaffAccess,
  hasStaffModulePermission,
  normalizeStaffAccess,
} from "../../shared/staffPermissions.js";

test("the shared permission matrix has unique modules and actions", () => {
  assert.deepEqual(Object.keys(STAFF_MODULE_ACTIONS), STAFF_MODULES.map(({ key }) => key));
  for (const actions of Object.values(STAFF_MODULE_ACTIONS)) assert.equal(new Set(actions).size, actions.length);
  assert.ok(STAFF_MODULE_ACTIONS.progress_monitoring.includes("upload_progress_photo"));
  assert.ok(STAFF_MODULE_ACTIONS.progress_monitoring.includes("delete_proof"));
});

test("each matrix action requires both an enabled parent and its exact action", () => {
  for (const [moduleKey, actions] of Object.entries(STAFF_MODULE_ACTIONS)) {
    for (const actionKey of actions) {
      const access = normalizeStaffAccess({ modules: { [moduleKey]: { enabled: true, actions: { [actionKey]: true } } } });
      assert.equal(hasStaffModulePermission({ role: "skilled_worker", staff_access: access }, moduleKey, actionKey), true, `${moduleKey}.${actionKey} should allow`);
      assert.equal(hasStaffModulePermission({ role: "skilled_worker", staff_access: access }, moduleKey, "unknown"), false);
      const parentDisabled = structuredClone(access);
      parentDisabled.modules[moduleKey].enabled = false;
      assert.equal(hasStaffModulePermission({ role: "skilled_worker", staff_access: parentDisabled }, moduleKey, actionKey), false, `${moduleKey}.${actionKey} must require enabled parent`);
    }
  }
});

test("missing, malformed, and legacy settings permissions fail closed", () => {
  for (const access of [undefined, null, {}, { profile_version: 1 }, { modules: { settings: { enabled: "true", actions: { manage_access: true, back_up: true } } } }]) {
    const normalized = normalizeStaffAccess(access);
    const user = { role: "skilled_worker", staff_access: normalized };
    assert.equal(hasStaffModulePermission(user, "settings", "manage_access"), false);
    assert.equal(hasStaffModulePermission(user, "settings", "back_up"), false);
  }
  const defaults = createDefaultStaffAccess("helper");
  assert.equal(defaults.modules.settings.enabled, true);
  assert.equal(defaults.modules.settings.actions.view, true);
  assert.equal(defaults.modules.settings.actions.manage_access, false);
  assert.equal(defaults.modules.settings.actions.back_up, false);
  assert.equal(defaults.modules.transactions.actions.cancel, false);
});

test("admins bypass staff module permissions while customers do not", () => {
  assert.equal(hasStaffModulePermission({ role: "admin" }, "settings", "back_up"), true);
  assert.equal(hasStaffModulePermission({ role: "super_admin" }, "settings", "back_up"), true);
  assert.equal(hasStaffModulePermission({ role: "customer" }, "dashboard", "view"), false);
});

test("direct middleware requests reject unassigned, malformed, and wrong-role module access", async (t) => {
  const originalFindById = User.findById;
  let dbUser = { role: "skilled_worker", is_active: true, staff_access: createDefaultStaffAccess("helper") };
  User.findById = () => ({ select: () => ({ lean: async () => dbUser }) });
  t.after(() => { User.findById = originalFindById; });

  const invoke = async (moduleKey, action, role = "skilled_worker") => {
    const req = { user: { id: "staff-id", role } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let passed = false;
    await staffModulePermission(moduleKey, action)(req, res, () => { passed = true; });
    return { passed, res };
  };

  let result = await invoke("settings", "manage_access");
  assert.equal(result.passed, false);
  assert.equal(result.res.statusCode, 403);
  dbUser.staff_access.modules.settings.actions.manage_access = true;
  result = await invoke("settings", "manage_access");
  assert.equal(result.passed, true);
  result = await invoke("settings", "not_a_real_action");
  assert.equal(result.passed, false);
  for (const [moduleKey, actions] of Object.entries(STAFF_MODULE_ACTIONS)) {
    for (const actionKey of actions) {
      dbUser.staff_access.modules[moduleKey].enabled = true;
      dbUser.staff_access.modules[moduleKey].actions[actionKey] = true;
      result = await invoke(moduleKey, actionKey);
      assert.equal(result.passed, true, `direct permission middleware denied ${moduleKey}.${actionKey}`);
      dbUser.staff_access.modules[moduleKey].actions[actionKey] = false;
      result = await invoke(moduleKey, actionKey);
      assert.equal(result.passed, false, `direct permission middleware allowed unassigned ${moduleKey}.${actionKey}`);
    }
  }
  dbUser.role = "customer";
  result = await invoke("settings", "manage_access");
  assert.equal(result.passed, false);
});
