import { describe, expect, it } from "vitest";
import {
  getApplicableGlobalCustomerPermissions,
  normalizeGlobalCustomerPermissions,
  resolveCustomerPermissions,
} from "./customerPermissions";

describe("customer global permissions", () => {
  it("preserves the global profile while view-only is active and restores it when disabled", () => {
    const globalProfile = normalizeGlobalCustomerPermissions({
      can_request_orders: true,
      can_estimate_pricing: false,
      view_only_access: true,
      can_track_products: true,
      can_upload_feedback: false,
      show_ratings_homepage: true,
    });

    expect(resolveCustomerPermissions({}, globalProfile)).toMatchObject({
      view_only_access: true,
      can_request_orders: false,
      can_track_products: false,
    });

    expect(resolveCustomerPermissions({}, { ...globalProfile, view_only_access: false })).toMatchObject({
      view_only_access: false,
      can_request_orders: true,
      can_estimate_pricing: false,
      can_track_products: true,
      can_upload_feedback: false,
      show_ratings_homepage: true,
    });
  });

  it("enables View Only when every customer feature is restricted", () => {
    const restricted = normalizeGlobalCustomerPermissions({
      view_only_access: true,
      can_request_orders: false,
      can_estimate_pricing: false,
      can_track_products: false,
      can_upload_feedback: false,
      show_ratings_homepage: false,
    });

    expect(normalizeGlobalCustomerPermissions({ ...restricted, view_only_access: false })).toMatchObject({
      view_only_access: true,
      can_request_orders: false,
      can_estimate_pricing: false,
      can_track_products: false,
      can_upload_feedback: false,
      show_ratings_homepage: false,
    });
  });

  it("applies global restrictions as a ceiling without enabling per-account restrictions", () => {
    expect(resolveCustomerPermissions({ can_request_orders: false }, { can_request_orders: true }).can_request_orders).toBe(false);
    expect(resolveCustomerPermissions({ can_request_orders: true }, { can_request_orders: false }).can_request_orders).toBe(false);
  });

  it("applies global restrictions to guests but not authenticated staff", () => {
    const globalPermissions = { can_request_orders: false, show_ratings_homepage: false };

    expect(getApplicableGlobalCustomerPermissions(undefined, globalPermissions)).toMatchObject(globalPermissions);
    expect(getApplicableGlobalCustomerPermissions("customer", globalPermissions)).toMatchObject(globalPermissions);
    expect(getApplicableGlobalCustomerPermissions("admin", globalPermissions).can_request_orders).toBe(true);
  });
});
