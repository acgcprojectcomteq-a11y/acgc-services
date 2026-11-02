import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, Mail, Send, X } from "lucide-react";
import { getPublicContact } from "@/api/auth";
import { getExtraChargeReceiptSendStatus, getProjectPaymentReceiptSendStatus, sendExtraChargeReceiptToCustomer, sendProjectPaymentReceiptToCustomer } from "@/api/orders";
import { buildExtraChargeReceiptHtml } from "@/lib/extraChargeReceipt";
import { generateExtraChargeReceiptPdf } from "@/lib/extraChargeReceiptPdf";

const money = (value) => `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (value) => value ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "";

export default function ExtraChargeReceiptModal({ receipt, darkMode = false, onClose, enableSend = false, onReceiptSent }) {
  const frameRef = useRef(null);
  const [companyPhone, setCompanyPhone] = useState("");
  const [sendStatus, setSendStatus] = useState(null);
  const [sendStatusLoading, setSendStatusLoading] = useState(false);
  const [sendStatusError, setSendStatusError] = useState("");
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const receiptId = useMemo(() => String(receipt?._id || receipt?.id || ""), [receipt]);
  const orderId = useMemo(() => String(receipt?.order?._id || receipt?.order?.id || receipt?.order || receipt?.order_id || ""), [receipt]);
  const isProjectPaymentReceipt = receipt?.receipt_type === "Project Payment Receipt";
  const receiptTitle = isProjectPaymentReceipt ? "Project payment receipt" : "Extra charge receipt";

  useEffect(() => {
    let active = true;
    setCompanyPhone("");
    if (!receipt) return () => { active = false; };
    getPublicContact()
      .then((contact) => { if (active) setCompanyPhone(String(contact?.phone || "").trim()); })
      .catch(() => { if (active) setCompanyPhone(""); });
    return () => { active = false; };
  }, [receipt]);

  useEffect(() => {
    let active = true;
    setSendStatus(null);
    setSendStatusError("");
    setSendError("");
    setSendSuccess("");
    if (!receipt || !enableSend || !orderId || !receiptId) return () => { active = false; };
    setSendStatusLoading(true);
    (isProjectPaymentReceipt ? getProjectPaymentReceiptSendStatus : getExtraChargeReceiptSendStatus)(orderId, receiptId)
      .then((result) => { if (active) setSendStatus(result); })
      .catch((error) => { if (active) setSendStatusError(error?.message || "Could not check the receipt sending status."); })
      .finally(() => { if (active) setSendStatusLoading(false); });
    return () => { active = false; };
  }, [receipt, enableSend, orderId, receiptId, isProjectPaymentReceipt]);

  if (!receipt) return null;
  const receiptHtml = buildExtraChargeReceiptHtml({ ...receipt, company_phone: companyPhone });
  const sendState = sendStatus?.receipt?.send_status || "Not Sent";
  const canSend = enableSend && sendStatus?.can_send === true && !sendSubmitting;

  const confirmAndSend = async () => {
    setSendSubmitting(true);
    setSendError("");
    setSendSuccess("");
    try {
      const receiptPdf = await generateExtraChargeReceiptPdf(frameRef.current);
      const sendReceipt = isProjectPaymentReceipt ? sendProjectPaymentReceiptToCustomer : sendExtraChargeReceiptToCustomer;
      const result = await sendReceipt(orderId, receiptId, receiptPdf, sendStatus?.customer?.email || "");
      setSendStatus((current) => ({ ...(current || {}), ...(result || {}), can_send: false, receipt: result?.receipt || current?.receipt }));
      setShowSendConfirmation(false);
      setSendSuccess("Receipt email accepted by the provider. The customer can now view it.");
      onReceiptSent?.(result);
    } catch (error) {
      setSendError(error?.message || "The receipt email could not be sent. You can retry.");
      setSendStatusError("");
      setSendStatus((current) => ({
        ...(current || {}),
        can_send: false,
        receipt: { ...(current?.receipt || {}), send_status: "Sending" },
      }));
      try {
        const getStatus = isProjectPaymentReceipt ? getProjectPaymentReceiptSendStatus : getExtraChargeReceiptSendStatus;
        setSendStatus(await getStatus(orderId, receiptId));
      } catch {
        setSendStatusError("Could not verify whether the email provider accepted the receipt. Refresh the receipt status before retrying.");
      }
    } finally {
      setSendSubmitting(false);
    }
  };

  const providerStatus = () => {
    if (sendStatusLoading) return <span className="inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" />Checking verified project balance and receipt status…</span>;
    if (sendStatusError) return <span className="text-red-700">{sendStatusError}</span>;
    if (sendState === "Sent") return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-emerald-800"><CheckCircle2 size={15} /><strong>Receipt Sent</strong><span>Accepted by email provider{sendStatus?.receipt?.sent_at ? ` · ${formatDateTime(sendStatus.receipt.sent_at)}` : ""}</span>{sendStatus?.receipt?.recipient_email && <span>· {sendStatus.receipt.recipient_email}</span>}</span>;
    if (sendState === "Sending") return <span className="inline-flex items-center gap-2 text-blue-800"><LoaderCircle size={14} className="animate-spin" />Receipt email is being submitted. Please wait.</span>;
    if (sendState === "Failed") return <span className="text-red-700">Previous send failed. {sendStatus?.receipt?.send_error || "You can retry the email."}</span>;
    if (sendStatus && !sendStatus.can_send) return <span>{sendStatus.send_block_reason || "Receipt sending will be available after all project charges are paid and verified."}</span>;
    if (sendSuccess) return <span className="text-emerald-800">{sendSuccess}</span>;
    if (sendError) return <span className="text-red-700">{sendError}</span>;
    return null;
  };

  return <div className="mobile-fullscreen-overlay fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-0 sm:p-3" role="dialog" aria-modal="true" aria-labelledby="extra-charge-receipt-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !showSendConfirmation) onClose(); }}>
    <section className={`mobile-fullscreen-dialog flex h-[94dvh] max-h-[94dvh] w-[min(100%,210mm)] flex-col overflow-hidden rounded-2xl shadow-2xl ${darkMode ? "border border-slate-600 bg-[#0d1f2f]" : "bg-slate-100"}`}>
      <header className={`z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:flex-nowrap sm:px-5 ${darkMode ? "border-slate-600 bg-[#11293a] text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="min-w-0"><h2 id="extra-charge-receipt-title" className="font-bold">{receiptTitle}</h2><p className="mt-0.5 text-xs opacity-70">Preview receipt · {receipt.receipt_number || "Receipt"}</p></div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => frameRef.current?.contentWindow?.print()} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white"><FileText size={14} /><span className="hidden sm:inline">Print / Save PDF</span><span className="sm:hidden">Print</span></button>
          {canSend && <button type="button" onClick={() => { setSendError(""); setShowSendConfirmation(true); }} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white transition hover:bg-blue-800"><Send size={14} /><span className="hidden sm:inline">{sendState === "Failed" ? "Retry sending receipt" : "Send Receipt to Customer"}</span><span className="sm:hidden">{sendState === "Failed" ? "Retry" : "Send receipt"}</span></button>}
          <button type="button" onClick={onClose} aria-label="Close receipt" className="rounded-lg p-2 hover:bg-slate-500/10"><X size={20} /></button></div>
      </header>
      {enableSend && <div className={`shrink-0 border-b px-4 py-2 text-xs sm:px-5 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`} aria-live="polite">{providerStatus()}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100 p-2 sm:p-3"><iframe ref={frameRef} title={`${receiptTitle} preview`} srcDoc={receiptHtml} onLoad={(event) => { const frame = event.currentTarget; const document = frame.contentDocument; if (!document) return; document.documentElement.scrollTop = 0; document.body.scrollTop = 0; frame.style.height = `${Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1123)}px`; }} style={{ height: "1123px" }} className="block w-full border-0 bg-white shadow-sm" /></div>
    </section>
    {showSendConfirmation && <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendSubmitting) setShowSendConfirmation(false); }}><section role="alertdialog" aria-modal="true" aria-labelledby="send-extra-charge-receipt-title" className={`w-full max-w-xl rounded-2xl border p-4 shadow-2xl sm:p-6 ${darkMode ? "border-slate-600 bg-[#11293a] text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
      <div className="flex items-start gap-3"><span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${darkMode ? "bg-blue-950 text-blue-200" : "bg-blue-50 text-blue-700"}`}><Mail size={19} /></span><div><h3 id="send-extra-charge-receipt-title" className="text-base font-bold">Send receipt to customer?</h3><p className={`mt-1 text-sm leading-5 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Are you sure you want to send this receipt to the customer? The customer will receive an in-app notification and an email containing the receipt.</p></div></div>
      <dl className={`mt-4 grid grid-cols-1 gap-x-5 gap-y-3 rounded-xl p-4 text-sm sm:grid-cols-2 ${darkMode ? "bg-slate-900/80" : "bg-slate-50"}`}>
        <div><dt className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Customer name</dt><dd className="mt-1 break-words font-semibold">{sendStatus?.customer?.name || receipt.customer_name || "Customer"}</dd></div>
        <div><dt className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Customer email</dt><dd className="mt-1 break-all font-semibold">{sendStatus?.customer?.email || "No registered email"}</dd></div>
        <div><dt className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Total project charges</dt><dd className="mt-1 font-semibold">{money(sendStatus?.balance?.total_project_charges)}</dd></div>
        <div><dt className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Total verified payments</dt><dd className="mt-1 font-semibold">{money(sendStatus?.balance?.total_verified_payments)}</dd></div>
        <div className="sm:col-span-2"><dt className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Remaining balance</dt><dd className="mt-1 font-bold text-emerald-700">{money(sendStatus?.balance?.remaining_balance)}</dd></div>
      </dl>
      {sendError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{sendError}</p>}
      <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" disabled={sendSubmitting} onClick={() => setShowSendConfirmation(false)} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50 ${darkMode ? "border-slate-600 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`}>Cancel</button><button type="button" disabled={sendSubmitting || !sendStatus?.can_send} onClick={confirmAndSend} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sendSubmitting ? <><LoaderCircle size={16} className="animate-spin" />Sending receipt…</> : <><Send size={15} />Confirm and Send Receipt</>}</button></div>
    </section></div>}
  </div>;
}
