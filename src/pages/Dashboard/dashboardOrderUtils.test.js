import { describe, expect, it } from "vitest";
import { getPendingRepairCount, isUntransferredSiteInspection } from "./dashboardOrderUtils";

describe("isUntransferredSiteInspection", () => {
  it("includes active site inspections that have not entered Transactions", () => {
    expect(isUntransferredSiteInspection({ status: "site_inspection", contract_status: "pending" })).toBe(true);
    expect(isUntransferredSiteInspection({ status: "site_inspection" })).toBe(true);
  });

  it("excludes records that have left the site-inspection workflow", () => {
    expect(isUntransferredSiteInspection({ status: "site_inspection", transactionCreated: true })).toBe(false);
    expect(isUntransferredSiteInspection({ status: "site_inspection", contractStatus: "accepted" })).toBe(false);
    expect(isUntransferredSiteInspection({ status: "contract_accepted" })).toBe(false);
  });
});

describe("getPendingRepairCount", () => {
  it("counts repair requests awaiting review or quotation approval", () => {
    expect(getPendingRepairCount([
      { status: "pending_review" },
      { status: "quotation_pending_approval" },
      { status: "scheduled" },
      { status: "completed" },
    ])).toBe(2);
  });

  it("handles missing repair data and normalizes status casing", () => {
    expect(getPendingRepairCount()).toBe(0);
    expect(getPendingRepairCount([{ status: " Pending_Review " }])).toBe(1);
  });
});
