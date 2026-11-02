import { describe, expect, it } from "vitest";
import { addProjectPaymentReceiptContext, buildExtraChargeReceiptHtml } from "@/lib/extraChargeReceipt";

const baseReceipt = {
  _id: "receipt-1",
  receipt_type: "Project Payment Receipt",
  receipt_number: "PR-2026-12345678",
  issued_at: "2026-11-03T00:00:00.000Z",
  customer_name: "Jamie Customer",
  customer_contact: "09123456789",
  original_project_amount: 9400,
  total_extra_charges: 0,
  total_project_charges: 9400,
  total_verified_payments: 9400,
  remaining_balance: 0,
  project_items: [{ name: "Shower Enclosures", quantity: 1, unit: "piece", line_total: 9400, width: 60, height: 72, measurement_unit: "in" }],
  extra_charges: [],
};

describe("project payment receipt", () => {
  it("renders a regular full-payment receipt without an empty extra-charge section", () => {
    const receipt = addProjectPaymentReceiptContext(baseReceipt, { tracking: "TRK-123", items: baseReceipt.project_items });
    const html = buildExtraChargeReceiptHtml(receipt);

    expect(receipt.receipt_type).toBe("Project Payment Receipt");
    expect(html).toContain("Project payment receipt");
    expect(html).toContain("Shower Enclosures");
    expect(html).toContain("PHP 9,400.00");
    expect(html).toContain("Total verified payments");
    expect(html).toContain("Remaining balance");
    expect(html).toContain("Fully paid");
    expect(html).not.toContain("Additional installation charges</h3>");
  });

  it("lists additional charge items separately on a fully paid project receipt", () => {
    const receipt = addProjectPaymentReceiptContext({
      ...baseReceipt,
      total_extra_charges: 300,
      total_project_charges: 9700,
      total_verified_payments: 9700,
      extra_charges: [{
        description: "Installation adjustment",
        total: 300,
        items: [{ description: "Labor", quantity: 1, unit_price: 300, total: 300 }],
      }],
    }, { tracking: "TRK-123", items: baseReceipt.project_items });
    const html = buildExtraChargeReceiptHtml(receipt);

    expect(html).toContain("Additional installation charges");
    expect(html).toContain("Installation adjustment — Labor");
    expect(html).toContain("PHP 9,700.00");
    expect(html).toContain("PHP 300.00");
  });
});
