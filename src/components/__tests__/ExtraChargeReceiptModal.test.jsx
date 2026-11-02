import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExtraChargeReceiptModal from "@/components/ExtraChargeReceiptModal";
import { getExtraChargeReceiptSendStatus, getProjectPaymentReceiptSendStatus, sendExtraChargeReceiptToCustomer, sendProjectPaymentReceiptToCustomer } from "@/api/orders";
import { generateExtraChargeReceiptPdf } from "@/lib/extraChargeReceiptPdf";

vi.mock("@/api/auth", () => ({ getPublicContact: vi.fn().mockResolvedValue({ phone: "+639000000000" }) }));
vi.mock("@/api/orders", () => ({
  getExtraChargeReceiptSendStatus: vi.fn(),
  getProjectPaymentReceiptSendStatus: vi.fn(),
  sendExtraChargeReceiptToCustomer: vi.fn(),
  sendProjectPaymentReceiptToCustomer: vi.fn(),
}));
vi.mock("@/lib/extraChargeReceipt", () => ({ buildExtraChargeReceiptHtml: vi.fn(() => "<!doctype html><html><body>Receipt</body></html>") }));
vi.mock("@/lib/extraChargeReceiptPdf", () => ({ generateExtraChargeReceiptPdf: vi.fn().mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" })) }));

const receipt = {
  _id: "receipt-1",
  order: "order-1",
  receipt_number: "EC-2026-00000001",
  receipt_type: "Extra Charge Receipt",
  customer_name: "Customer Name",
  project_reference: "TRK-123456",
};

const eligibleStatus = {
  can_send: true,
  customer: { name: "Customer Name", email: "customer@example.com" },
  project_reference: "TRK-123456",
  balance: { total_project_charges: 1300, total_verified_payments: 1300, remaining_balance: 0 },
  receipt: { _id: "receipt-1", receipt_number: "EC-2026-00000001", receipt_type: "Extra Charge Receipt", send_status: "Not Sent" },
};

beforeEach(() => {
  vi.clearAllMocks();
  generateExtraChargeReceiptPdf.mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" }));
  getExtraChargeReceiptSendStatus.mockResolvedValue(eligibleStatus);
});

it("hides the send action when the backend says the project is not fully paid", async () => {
  getExtraChargeReceiptSendStatus.mockResolvedValue({ ...eligibleStatus, can_send: false, balance: { ...eligibleStatus.balance, remaining_balance: 300 } });
  render(<ExtraChargeReceiptModal receipt={receipt} enableSend onClose={vi.fn()} />);

  await waitFor(() => expect(getExtraChargeReceiptSendStatus).toHaveBeenCalledWith("order-1", "receipt-1"));
  expect(screen.queryByRole("button", { name: /send receipt to customer/i })).toBeNull();
  expect(screen.getByText(/paid and verified/i)).toBeTruthy();
});

it("shows readable payment details in the confirmation and cancel does not send", async () => {
  render(<ExtraChargeReceiptModal receipt={receipt} enableSend onClose={vi.fn()} />);
  const sendButton = await screen.findByRole("button", { name: /send receipt to customer/i });
  fireEvent.click(sendButton);

  expect(await screen.findByRole("alertdialog", { name: /send receipt to customer/i })).toBeTruthy();
  expect(screen.getByText("customer@example.com")).toBeTruthy();
  expect(screen.queryByText("TRK-123456")).toBeNull();
  expect(screen.getAllByText("PHP 1,300.00")).toHaveLength(2);
  expect(screen.getByText("PHP 0.00")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(sendExtraChargeReceiptToCustomer).not.toHaveBeenCalled();
});

it("marks the receipt sent only after the send endpoint succeeds", async () => {
  const onReceiptSent = vi.fn();
  sendExtraChargeReceiptToCustomer.mockResolvedValue({
    success: true,
    receipt: { ...eligibleStatus.receipt, send_status: "Sent", recipient_email: "customer@example.com", sent_at: "2026-11-03T00:00:00.000Z", provider_delivery_status: "accepted" },
  });
  render(<ExtraChargeReceiptModal receipt={receipt} enableSend onReceiptSent={onReceiptSent} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /send receipt to customer/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm and send receipt/i }));

  await waitFor(() => expect(sendExtraChargeReceiptToCustomer).toHaveBeenCalledWith("order-1", "receipt-1", expect.any(Blob), "customer@example.com"));
  expect(await screen.findByText(/Receipt Sent/)).toBeTruthy();
  expect(onReceiptSent).toHaveBeenCalledTimes(1);
});

it("keeps failed receipt emails unreleased and offers retry", async () => {
  sendExtraChargeReceiptToCustomer.mockRejectedValue(new Error("Receipt email was not accepted."));
  getExtraChargeReceiptSendStatus
    .mockResolvedValueOnce(eligibleStatus)
    .mockResolvedValueOnce({ ...eligibleStatus, can_send: true, receipt: { ...eligibleStatus.receipt, send_status: "Failed", send_error: "Provider unavailable" } });
  render(<ExtraChargeReceiptModal receipt={receipt} enableSend onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /send receipt to customer/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm and send receipt/i }));

  expect(await screen.findByText(/Previous send failed/)).toBeTruthy();
  expect(await screen.findByRole("button", { name: /retry sending receipt/i })).toBeTruthy();
  expect(screen.queryByText(/Receipt Sent/)).toBeNull();
});

it("uses project payment receipt endpoints for a regular project receipt", async () => {
  getProjectPaymentReceiptSendStatus.mockResolvedValue(eligibleStatus);
  sendProjectPaymentReceiptToCustomer.mockResolvedValue({
    success: true,
    receipt: { ...eligibleStatus.receipt, receipt_type: "Project Payment Receipt", send_status: "Sent", recipient_email: "customer@example.com" },
  });
  const projectReceipt = { ...receipt, receipt_type: "Project Payment Receipt", receipt_number: "PR-2026-00000001" };
  render(<ExtraChargeReceiptModal receipt={projectReceipt} enableSend onClose={vi.fn()} />);

  expect(await screen.findByRole("heading", { name: "Project payment receipt" })).toBeTruthy();
  await waitFor(() => expect(getProjectPaymentReceiptSendStatus).toHaveBeenCalledWith("order-1", "receipt-1"));
  fireEvent.click(await screen.findByRole("button", { name: /send receipt to customer/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm and send receipt/i }));

  await waitFor(() => expect(sendProjectPaymentReceiptToCustomer).toHaveBeenCalledWith("order-1", "receipt-1", expect.any(Blob), "customer@example.com"));
  expect(sendExtraChargeReceiptToCustomer).not.toHaveBeenCalled();
});
