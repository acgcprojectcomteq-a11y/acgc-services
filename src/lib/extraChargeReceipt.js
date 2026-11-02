import acgcLogo from "@/assets/images/ACGCLOGO1.png";

const money = (value) => `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateLabel = (value) => value ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" }) : "Not available";

const referenceId = (value) => String(value && typeof value === "object" ? value._id || value.id || "" : value || "");

export const addExtraChargeReceiptContext = (receipt, order, charges = []) => {
  if (!receipt) return receipt;

  const orderItems = [order?.project_items, order?.items, order?.order_items].find((items) => Array.isArray(items) && items.length) || [];
  const sourceProjectItems = orderItems.length
    ? orderItems
    : Array.isArray(receipt.project_items) ? receipt.project_items : [];
  const projectItems = sourceProjectItems.map((item) => {
    const orderedQuantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const product = item.product_id && typeof item.product_id === "object" ? item.product_id : item.product || {};
    const total = Number(item.total)
      || Number(item.line_total)
      || Number(item.estimated_price)
      || Number(item.manual_estimated_total)
      || (Number(item.unit_price ?? item.base_price ?? product.unit_price ?? product.base_price) || 0) * orderedQuantity;
    const width = Number(item.dimensions?.width ?? item.width ?? product.width) || 0;
    const height = Number(item.dimensions?.height ?? item.height ?? product.height) || 0;
    const unit = item.dimensions?.unit || item.measurement_unit || product.measurement_unit || "in";
    const sourceUnit = String(item.unit || product.unit || "piece").trim().toLowerCase().replaceAll("_", " ");
    const isSquareFootPricing = ["per sqft", "per sq ft", "sqft", "sq ft", "square feet"].includes(sourceUnit);
    const toFeet = unit === "in" ? 1 / 12 : unit === "cm" ? 1 / 30.48 : unit === "m" ? 1 / 0.3048 : 1;
    const squareFeet = Number(item.area) > 0 ? Number(item.area) : width > 0 && height > 0 ? width * toFeet * height * toFeet : 0;
    const hasLegacyAreaQuantity = item.receipt_quantity_normalized && isSquareFootPricing && squareFeet > 0;
    const quantity = Number(item.ordered_quantity) > 0
      ? Number(item.ordered_quantity)
      : hasLegacyAreaQuantity ? Math.round(orderedQuantity / squareFeet * 100) / 100 : orderedQuantity;
    const receiptUnit = isSquareFootPricing ? "item" : String(item.unit || product.unit || "piece");
    const detailParts = [
      width > 0 && height > 0 ? `Dimensions: ${width} x ${height} ${unit}` : "",
      squareFeet > 0 ? `Area: ${Number(squareFeet.toFixed(2))} sq ft` : "",
      Number(item.blade_count ?? product.blade_count) > 0 ? `${Number(item.blade_count ?? product.blade_count)} blade${Number(item.blade_count ?? product.blade_count) === 1 ? "" : "s"}` : "",
      item.blade_glass_type ? `Glass: ${item.blade_glass_type}` : "",
      item.piece_option ? `Option: ${item.piece_option}` : "",
      item.frame_type ? `Frame: ${item.frame_type}` : "",
      ...(Array.isArray(item.additional_project_charges) ? item.additional_project_charges.map((entry) => `${entry.name || "Additional item"}: ${money(entry.amount)}`) : []),
    ].filter(Boolean);
    const details = item.details || detailParts.join(" | ");

    return {
      description: item.description || item.name || item.product_name || product.name || product.product_name || "Project item",
      ordered_quantity: quantity,
      quantity,
      unit: receiptUnit,
      total,
      details,
    };
  });
  const sourceCharges = charges.length ? charges : (order?.extra_charge_receipts || []);
  const otherCharges = sourceCharges
    .filter((entry) => referenceId(entry._id) !== referenceId(receipt.extra_charge)
      && referenceId(entry._id) !== referenceId(receipt._id)
      && referenceId(entry.extra_charge) !== referenceId(receipt.extra_charge))
    .map((entry) => {
      const total = Number(entry.total) || 0;
      const verifiedPaid = (entry.payments || [])
        .filter((payment) => payment.status === "verified")
        .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
      return {
        description: entry.description || "Installation charge",
        reason: entry.reason || "",
        total,
        verified_paid: verifiedPaid,
        remaining: Math.max(total - verifiedPaid, 0),
        status: verifiedPaid >= total ? "Paid" : verifiedPaid > 0 ? "Partially paid" : "Unpaid",
        receipt_number: entry.receipt_number || "",
        issued_at: entry.issued_at || entry.createdAt || null,
      };
    });
  const projectItemsTotal = projectItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const earlierChargesTotal = otherCharges.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const orderBaseTotal = Number(order?.contract_amount)
    || Number(order?.final_project_cost)
    || Number(order?.total_amount ?? order?.totalAmount ?? order?.total)
    || projectItemsTotal;
  const calculatedProjectTotalBefore = orderBaseTotal + earlierChargesTotal;
  const projectTotalBeforeCharge = receipt.project_total_before_charge !== undefined && receipt.project_total_before_charge !== null
    ? Number(receipt.project_total_before_charge)
    : calculatedProjectTotalBefore;
  const projectTotalAfterCharge = receipt.project_total_after_charge !== undefined && receipt.project_total_after_charge !== null
    ? Number(receipt.project_total_after_charge)
    : projectTotalBeforeCharge + (Number(receipt.total) || 0);
  return {
    ...receipt,
    project_items: projectItems,
    other_charges: Array.isArray(receipt.other_charges) && receipt.other_charges.length ? receipt.other_charges : otherCharges,
    project_total_before_charge: projectTotalBeforeCharge,
    project_total_after_charge: projectTotalAfterCharge,
  };
};

export const addProjectPaymentReceiptContext = (receipt, order = {}) => {
  if (!receipt) return receipt;
  const withProjectItems = addExtraChargeReceiptContext(receipt, {
    ...order,
    project_items: receipt.project_items?.length ? receipt.project_items : order.project_items,
    final_project_cost: receipt.original_project_amount ?? order.final_project_cost,
  }, []);
  const extraCharges = Array.isArray(receipt.extra_charges) ? receipt.extra_charges : [];
  const chargeItems = extraCharges.flatMap((charge) => {
    const sourceItems = Array.isArray(charge.items) && charge.items.length ? charge.items : [null];
    return sourceItems.map((item) => {
      const quantity = Number(item?.quantity) > 0 ? Number(item.quantity) : 1;
      const total = Number(item?.total) >= 0 ? Number(item.total) : Number(charge.total) || 0;
      return {
        description: [charge.description, item?.description].filter(Boolean).join(" — ") || "Additional installation charge",
        quantity,
        unit_price: Number(item?.unit_price) >= 0 ? Number(item.unit_price) : total / quantity,
        total,
      };
    });
  });
  return {
    ...withProjectItems,
    receipt_type: "Project Payment Receipt",
    items: chargeItems,
    project_total_before_charge: Number(receipt.original_project_amount) || 0,
    project_total_after_charge: Number(receipt.total_project_charges) || 0,
    total_extra_charges: Number(receipt.total_extra_charges) || 0,
    total_verified_payments: Number(receipt.total_verified_payments) || 0,
    remaining_balance: Number(receipt.remaining_balance) || 0,
  };
};

export const buildExtraChargeReceiptHtml = (receipt) => {
  const projectItems = (receipt.project_items || []).map((item) => `<tr><td class="qty">${escapeHtml(item.quantity ?? 1)} ${escapeHtml(item.unit || "")}</td><td><strong>${escapeHtml(item.description || "Project item")}</strong>${item.details ? `<div class="details">${escapeHtml(item.details)}</div>` : ""}</td><td class="amount">${money(item.total)}</td></tr>`);
  const chargeItems = (receipt.items || []).map((item) => `<tr><td class="qty">${escapeHtml(item.quantity ?? 1)}</td><td>${escapeHtml(item.description || "Charge item")}</td><td class="amount">${money(item.unit_price)}</td><td class="amount">${money(item.total)}</td></tr>`);
  const otherCharges = (receipt.other_charges || []).map((charge) => `<tr><td><strong>${escapeHtml(charge.description || "Installation charge")}</strong>${charge.reason ? `<div class="details">Reason: ${escapeHtml(charge.reason)}</div>` : ""}${charge.receipt_number ? `<div class="details">Receipt ${escapeHtml(charge.receipt_number)}</div>` : ""}</td><td>${escapeHtml(charge.status || "Unpaid")}</td><td class="amount">${money(charge.total)}</td><td class="amount">${money(charge.remaining)}</td></tr>`);
  const isProjectPaymentReceipt = receipt.receipt_type === "Project Payment Receipt";
  const receiptTypeLabel = isProjectPaymentReceipt ? "Project payment receipt" : "Extra charge receipt";
  const receiptNumber = receipt.receipt_number || receiptTypeLabel;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(receiptTypeLabel)} ${escapeHtml(receiptNumber)}</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;background:#f1f5f4;color:#172b2a;font:15px/1.55 Arial,Helvetica,sans-serif}.sheet{position:relative;width:100%;max-width:210mm;min-height:297mm;margin:0 auto;padding:48px 52px;background:#fff;border:1px solid #e4ece9;box-shadow:0 12px 40px #18332b12}.topline{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:24px;border-bottom:2px solid #5c9382}.brand{display:flex;align-items:center;gap:10px}.logo{width:44px;height:44px;object-fit:contain}.company{margin:0;color:#244b41;font-size:18px;font-weight:800;letter-spacing:-.3px}.meta{min-width:190px;text-align:right}.meta-label{color:#526760;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}.meta-value{margin:3px 0 11px;font-size:15px;font-weight:700}.parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:30px 0}.section-label{margin:0 0 8px;color:#356f60;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px}.party-name{margin:0 0 4px;font-size:16px;font-weight:700}.subtle{color:#4c625b;font-size:13px}.provider-phone{display:flex;align-items:center;gap:6px}.provider-phone svg{width:14px;height:14px;flex:none;color:#356f60}.receipt-section{margin:24px 0}.section-heading{margin:0 0 10px;color:#244f44;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.7px}table{width:100%;border-collapse:collapse}thead{background:#5b9382;color:white}th{padding:12px 13px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.6px}th.amount{text-align:right;color:white}td.amount{text-align:right;color:#087443;font-weight:600;white-space:nowrap}td{padding:13px;border-bottom:1px solid #d9e5e0;vertical-align:top}td.qty{width:74px;color:#344b45;text-align:center;white-space:nowrap}.details{margin-top:4px;color:#4c625b;font-size:12px;line-height:1.5}.empty-details{padding:14px;border:1px dashed #b6c9c1;border-radius:6px;color:#4c625b;font-size:13px}.totals{width:min(100%,420px);margin:22px 0 0 auto}.total-row{display:flex;justify-content:space-between;gap:18px;padding:8px 0;color:#344b45;font-size:14px}.total-row.grand{margin-top:7px;padding:14px 0;border-top:2px solid #4c8977;color:#193d34;font-size:18px;font-weight:800}.total-row strong,.total-row.grand span:last-child{color:#087443}.footer{position:absolute;right:52px;bottom:32px;left:52px;display:flex;justify-content:space-between;gap:16px;padding-top:15px;border-top:1px solid #c7d6d0;color:#344b45;font-size:13px;font-weight:600}@media(max-width:640px){body{background:white}.sheet{min-height:100vh;margin:0;padding:26px 20px;border:0;box-shadow:none}.topline{gap:10px}.company{font-size:15px}.logo{width:36px;height:36px}.meta{min-width:130px}.parties{gap:16px}.footer{right:20px;left:20px;flex-direction:column;align-items:flex-start;gap:6px}}@media print{body{background:#fff}.sheet{max-width:none;min-height:255mm;margin:0;padding:0;border:0;box-shadow:none}.footer{right:0;bottom:0;left:0}}@media screen,print{.sheet .footer{position:static;right:auto;bottom:auto;left:auto;margin-top:28px}}
  </style></head><body><main class="sheet"><div class="topline"><div class="brand"><img class="logo" src="${escapeHtml(acgcLogo)}" alt="ACGC logo"><div><h1 class="company">ACGC Glass &amp; Aluminum Services</h1>${isProjectPaymentReceipt ? '<p style="margin:2px 0 0;color:#356f60;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Official Project Payment Receipt</p>' : ""}</div></div><div class="meta"><div class="meta-label">Receipt date</div><div class="meta-value">${escapeHtml(dateLabel(receipt.issued_at))}</div></div></div>
    <section class="parties"><div><p class="section-label">Billed to</p><p class="party-name">${escapeHtml(receipt.customer_name || "Customer")}</p><div class="subtle">${escapeHtml(receipt.customer_contact || "Customer account")}</div></div><div><p class="section-label">Service provider</p><p class="party-name">ACGC Glass &amp; Aluminum Services</p><div class="subtle provider-phone"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escapeHtml(receipt.company_phone || "")}</div></div></section>
    <section class="receipt-section"><h3 class="section-heading">Products ordered</h3>${projectItems.length ? `<table><thead><tr><th>Quantity</th><th>Product and details</th><th class="amount">Item total</th></tr></thead><tbody>${projectItems.join("")}</tbody></table>` : `<div class="empty-details">Product details are unavailable for this order.</div>`}</section>
    ${chargeItems.length ? `<section class="receipt-section"><h3 class="section-heading">${isProjectPaymentReceipt ? "Additional installation charges" : "Extra charge"}</h3><table><thead><tr><th>Qty</th><th>Description</th><th class="amount">Unit price</th><th class="amount">Amount</th></tr></thead><tbody>${chargeItems.join("")}</tbody></table></section>` : ""}
    ${otherCharges.length ? `<section class="receipt-section"><h3 class="section-heading">Other installation charges</h3><table><thead><tr><th>Charge and reason</th><th>Status</th><th class="amount">Total</th><th class="amount">Remaining</th></tr></thead><tbody>${otherCharges.join("")}</tbody></table></section>` : ""}
    ${isProjectPaymentReceipt
      ? `<section class="totals"><div class="total-row"><span>Original project amount</span><strong>${money(receipt.project_total_before_charge)}</strong></div>${Number(receipt.total_extra_charges) > 0 ? `<div class="total-row"><span>Total extra charges</span><strong>${money(receipt.total_extra_charges)}</strong></div>` : ""}<div class="total-row"><span>Total project charges</span><strong>${money(receipt.project_total_after_charge)}</strong></div><div class="total-row"><span>Total verified payments</span><strong>${money(receipt.total_verified_payments)}</strong></div><div class="total-row grand"><span>Remaining balance</span><span>${money(receipt.remaining_balance)}</span></div><div class="total-row"><span>Payment status</span><strong>Fully paid</strong></div></section>`
      : `<section class="totals"><div class="total-row"><span>Project total before this charge</span><strong>${money(receipt.project_total_before_charge)}</strong></div><div class="total-row"><span>Extra charge</span><strong>${money(receipt.total)}</strong></div><div class="total-row grand"><span>Total amount</span><span>${money(receipt.project_total_after_charge)}</span></div></section>`}
    <footer class="footer"><span>Thank you for choosing ACGC Glass &amp; Aluminum Services.</span><span>${escapeHtml(receiptNumber)}</span></footer></main></body></html>`;
};
