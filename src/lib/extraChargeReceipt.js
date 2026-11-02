import jsPDF from "jspdf";
import companyLogo from "@/assets/images/ACGCLOGO1.png";

const peso = (value) => `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const loadLogo = () => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    } catch { resolve(null); }
  };
  image.onerror = () => resolve(null);
  image.src = companyLogo;
});

export const downloadExtraChargeReceipt = async (receipt) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  if (logo) doc.addImage(logo, "PNG", 14, 12, 34, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("EXTRA CHARGE RECEIPT", 200, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("ACGC Aluminum Services", 14, 36);
  doc.text(`Receipt No.: ${receipt.receipt_number}`, 200, 27, { align: "right" });
  doc.text(`Receipt Date: ${new Date(receipt.issued_at).toLocaleDateString("en-PH")}`, 200, 33, { align: "right" });
  doc.setDrawColor(210);
  doc.line(14, 39, 196, 39);
  doc.setFont("helvetica", "bold");
  doc.text("Customer and project", 14, 48);
  doc.setFont("helvetica", "normal");
  doc.text(`Customer: ${receipt.customer_name || "—"}`, 14, 55);
  doc.text(`Contact: ${receipt.customer_contact || "—"}`, 14, 61);
  doc.text(`Project reference: ${receipt.project_reference || "—"}`, 14, 67);
  doc.text(`Affected item: ${receipt.affected_item || "—"}`, 14, 73);
  doc.text(`Description: ${receipt.description || "—"}`, 14, 81, { maxWidth: 180 });
  doc.text(`Reason: ${receipt.reason || "—"}`, 14, 89, { maxWidth: 180 });
  let y = 101;
  doc.setFont("helvetica", "bold");
  doc.text("Charge item", 14, y);
  doc.text("Qty", 135, y, { align: "right" });
  doc.text("Unit price", 165, y, { align: "right" });
  doc.text("Amount", 196, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 7;
  for (const item of receipt.items || []) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text(String(item.description || "Charge item").slice(0, 65), 14, y);
    doc.text(String(item.quantity ?? 1), 135, y, { align: "right" });
    doc.text(peso(item.unit_price), 165, y, { align: "right" });
    doc.text(peso(item.total), 196, y, { align: "right" });
    y += 7;
  }
  y += 5;
  doc.line(115, y, 196, y);
  y += 8;
  doc.text(`Previous outstanding balance: ${peso(receipt.previous_outstanding)}`, 196, y, { align: "right" });
  y += 7;
  doc.text(`Total extra charges: ${peso(receipt.total)}`, 196, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text(`Updated outstanding at issue: ${peso(receipt.updated_outstanding_at_issue)}`, 196, y, { align: "right" });
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.text(`Payment status: ${receipt.payment_status || "Unpaid"}`, 14, y);
  y += 7;
  for (const payment of (receipt.payments || []).filter((entry) => entry.status === "verified")) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(`Verified payment: ${peso(payment.amount)} · ${payment.method || "Payment"} · ${new Date(payment.verified_at || payment.recorded_at || Date.now()).toLocaleDateString("en-PH")}`, 14, y);
    y += 6;
  }
  doc.text(`Issued by: ${receipt.issued_by_name || "Authorized staff"}`, 14, y + 2);
  doc.setFontSize(8);
  doc.text("This receipt records an approved extra charge. Receipt issuance is not proof of payment.", 14, 282, { maxWidth: 180 });
  doc.save(`${receipt.receipt_number || "Extra-Charge-Receipt"}.pdf`);
};
