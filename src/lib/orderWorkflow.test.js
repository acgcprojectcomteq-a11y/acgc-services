import { describe, expect, it } from "vitest";
import { isProgressMonitorEligibleOrder } from "./orderWorkflow";

describe("isProgressMonitorEligibleOrder", () => {
  it("sends customer-accepted contracts to Progress Monitor without admin approval", () => {
    expect(isProgressMonitorEligibleOrder({
      status: "contract_accepted",
      contract_status: "accepted",
      acceptedByCustomer: true,
      transaction_approved: false,
    })).toBe(true);
  });

  it("retains existing eligible transaction and admin review statuses", () => {
    expect(isProgressMonitorEligibleOrder({ status: "approved", transaction_approved: true })).toBe(true);
    expect(isProgressMonitorEligibleOrder({ status: "admin_review" })).toBe(true);
  });

  it("shows saved active production stages even when the coarse order status is site inspection", () => {
    expect(isProgressMonitorEligibleOrder({
      status: "site_inspection",
      contract_status: "accepted",
      transaction_approved: false,
      progress_stages: [
        { key: "cutting", status: "done", completed: true },
        { key: "fabrication", status: "done", completed: true },
        { key: "installation", status: "pending", completed: false },
      ],
    })).toBe(true);
  });

  it("includes batch rows when an item's saved stage is active", () => {
    expect(isProgressMonitorEligibleOrder({
      status: "site_inspection",
      items: [{ progress_stages: [{ key: "installation", status: "in_progress" }] }],
    })).toBe(true);
  });

  it("keeps accepted transactions eligible when all saved stages are still pending", () => {
    expect(isProgressMonitorEligibleOrder({
      status: "contract_accepted",
      contract_status: "accepted",
      transaction_approved: false,
      progress_stages: [{ key: "installation", status: "pending", completed: false }],
    })).toBe(true);
  });

  it("keeps orders out of Progress Monitor before contract acceptance", () => {
    expect(isProgressMonitorEligibleOrder({
      status: "site_inspection",
      contract_status: "sent",
      acceptedByCustomer: false,
      transaction_approved: false,
    })).toBe(false);
  });

  it("keeps cancelled projects available for the read-only cancelled history tab", () => {
    expect(isProgressMonitorEligibleOrder({ status: "cancelled" })).toBe(true);
  });
});
