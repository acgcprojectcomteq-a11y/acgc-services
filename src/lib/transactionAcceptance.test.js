import { describe, expect, it } from "vitest";
import { hasAcceptedTransactionContract } from "./transactionAcceptance";

describe("hasAcceptedTransactionContract", () => {
  it("includes an accepted online contract using the stored acceptance field", () => {
    expect(hasAcceptedTransactionContract({
      contract_status: "accepted",
      acceptance_method: "online",
      acceptedByCustomer: true,
      order_type: "online_order",
    })).toBe(true);
  });

  it("supports older records that only have the display acceptance method", () => {
    expect(hasAcceptedTransactionContract({
      contract_status: "accepted",
      acceptanceMethod: "Online Acceptance",
      acceptedByCustomer: true,
    })).toBe(true);
  });

  it("requires a signed contract for accepted walk-in records", () => {
    const walkIn = {
      contract_status: "accepted",
      order_type: "walk_in_customer",
      acceptance_method: "walk_in_signed_contract",
      signed_contract_url: "/contract.pdf",
      contract_signed_date: "2026-10-28",
    };
    expect(hasAcceptedTransactionContract(walkIn)).toBe(true);
    expect(hasAcceptedTransactionContract({ ...walkIn, signed_contract_url: "" })).toBe(false);
  });

  it("excludes contracts that have not been accepted", () => {
    expect(hasAcceptedTransactionContract({
      contract_status: "sent",
      acceptance_method: "online",
      acceptedByCustomer: false,
    })).toBe(false);
  });
});
