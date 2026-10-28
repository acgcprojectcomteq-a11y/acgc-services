import { describe, expect, it } from "vitest";
import { buildContractSnapshot, getContractBladeDetails, hasContractSnapshotChanged, hasExistingContract } from "./contractState";

describe("contract state tracking", () => {
  it("resolves per-blade glass, count, and selected frame pricing for contract lines", () => {
    expect(getContractBladeDetails(
      { pricing_method: "per_blade", blade_glass_type: "Tinted", sale_mode: "frame", frame_type: "Classic" },
      {
        price_per_blade: 75,
        blade_count: 12,
        blade_glass_types: [{ name: "Tinted", price_per_blade: 90 }],
        blade_frame_types: [{ name: "Classic", blade_count: 12, price: 500 }],
      },
    )).toEqual({
      isBlade: true,
      hasPriceOverride: false,
      glassName: "Tinted",
      bladeCount: 12,
      bladeRate: 90,
      saleMode: "frame",
      frameName: "Classic",
      framePrice: 500,
    });
  });

  it("recognizes persisted, sent, and accepted contracts as existing", () => {
    expect(hasExistingContract({ contractGenerated: true })).toBe(true);
    expect(hasExistingContract({ contract_status: "sent" })).toBe(true);
    expect(hasExistingContract({ status: "contract_accepted" })).toBe(true);
    expect(hasExistingContract({ contract_status: "pending", total_amount: 5000 })).toBe(false);
  });

  it("builds a stable contract snapshot from the inspection fields", () => {
    const order = {
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      customer_phone: "09123456789",
      shipping_address: "123 Main St",
      payment_terms: "50% down",
      inspection_date: "2026-06-18T00:00:00.000Z",
      items: [{ name: "Glass Panel", width: 36, height: 60, quantity: 2, unit: "in" }],
      total_amount: 5000,
      contract_amount: 5000,
    };

    expect(buildContractSnapshot(order)).toEqual({
      customerName: "Jane Doe",
      email: "jane@example.com",
      phone: "09123456789",
      siteAddress: "123 Main St",
      product: "Glass Panel",
      dimensions: "36 x 60 in",
      quantity: 2,
      productCharges: [{ product: "Glass Panel", charges: [] }],
      projectCost: 5000,
      additionalCharges: [],
      downpayment: 2500,
      paymentTerms: "50% down",
      inspectionDate: "2026-06-18",
    });
  });

  it("detects when contract details have changed", () => {
    const current = {
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      customer_phone: "09123456789",
      shipping_address: "123 Main St",
      payment_terms: "50% down",
      inspection_date: "2026-06-18T00:00:00.000Z",
      contractSnapshot: {
        customerName: "Jane Doe",
        email: "jane@example.com",
        phone: "09123456789",
        siteAddress: "123 Main St",
        product: "Glass Panel",
        dimensions: "36 x 60 in",
        quantity: 2,
        projectCost: 5000,
        downpayment: 2500,
        paymentTerms: "50% down",
        inspectionDate: "2026-06-18",
      },
      items: [{ name: "Glass Panel", width: 36, height: 60, quantity: 2, unit: "in" }],
      total_amount: 5000,
      contract_amount: 5000,
    };

    expect(hasContractSnapshotChanged(current)).toBe(false);

    current.shipping_address = "456 New St";
    expect(hasContractSnapshotChanged(current)).toBe(true);
  });

  it("uses a configured downpayment amount in the contract snapshot", () => {
    const snapshot = buildContractSnapshot({
      total_amount: 20000,
      required_downpayment_amount: 10000,
      payment_terms: "50%_down_payment",
    });

    expect(snapshot.downpayment).toBe(10000);
  });

  it("falls back to half of the project cost when stored downpayment is zero", () => {
    const snapshot = buildContractSnapshot({
      total_amount: 40240,
      contract_amount: 40240,
      required_downpayment_amount: 0,
      downpayment_amount: 0,
      payment_terms: "50%_down_payment",
    });

    expect(snapshot.downpayment).toBe(20120);
  });
});
