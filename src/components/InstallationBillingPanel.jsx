import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { uploadFiles } from "@/api/uploads";
import {
  getInstallationBilling, createInstallationIssue, updateInstallationIssue,
  updateInstallationStatus,
  createExtraCharge, submitExtraCharge, reviewExtraCharge, issueExtraChargeReceipt,
  recordExtraChargePayment, verifyExtraChargePayment,
} from "@/api/orders";
import { downloadExtraChargeReceipt } from "@/lib/extraChargeReceipt";
import { subscribeToRealtime } from "@/lib/realtimeEvents";

const issueStatuses = ["Open", "Under Assessment", "For Adjustment", "Return Visit Required", "Resolved"];
const money = (value) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (error, fallback) => error?.message || fallback;

export default function InstallationBillingPanel({ order, darkMode = false }) {
  const user = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(window.localStorage.getItem("user") || "null"); }
    catch { return null; }
  }, []);
  const isAdmin = ["admin", "super_admin"].includes(user?.role);
  const isCustomer = user?.role === "customer";
  const canView = isAdmin || isCustomer || (user?.role === "skilled_worker" && user.staff_access?.modules?.progress_monitoring?.enabled === true && user.staff_access.modules.progress_monitoring.actions?.view === true);
  const isStaff = isAdmin || (user?.role === "skilled_worker" && user.staff_access?.modules?.progress_monitoring?.enabled === true && user.staff_access.modules.progress_monitoring.actions?.edit === true);
  const canUploadEvidence = ["admin", "super_admin"].includes(user?.role) || user?.staff_access?.modules?.progress_monitoring?.actions?.upload_progress_photo === true;
  const orderId = order?._id || order?.id;
  const [data, setData] = useState({ issues: [], charges: [], receipts: [], items: [], balance: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [receiptForReview, setReceiptForReview] = useState(null);
  const [issueDraft, setIssueDraft] = useState({ issue_type: "", item_index: "", description: "", measurement_details: "", required_action: "", files: [] });
  const [chargeDraft, setChargeDraft] = useState({ installation_issue: "", item_index: "", description: "", reason: "", customer_chargeable: false, notes: "", files: [], items: [{ description: "", category: "Labor", quantity: 1, unit_price: "" }] });
  const [declineReasons, setDeclineReasons] = useState({});
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [paymentDetails, setPaymentDetails] = useState({});
  const paymentRequestIds = useRef({});
  const [returnDrafts, setReturnDrafts] = useState({});
  const panelClass = darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const fieldClass = `w-full rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`;

  const refresh = useCallback(async () => {
    if (!orderId || !canView || !/^[a-f\d]{24}$/i.test(String(orderId))) return;
    setLoading(true);
    try {
      const result = await getInstallationBilling(orderId);
      setData({ issues: result.issues || [], charges: result.charges || [], receipts: result.receipts || [], items: result.items || [], balance: result.balance || null });
    } catch (error) {
      toast.error(getError(error, "Could not load installation records."));
    } finally { setLoading(false); }
  }, [orderId, canView]);
  useEffect(() => {
    const timer = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => subscribeToRealtime("orders", (event) => {
    if (!event.orderId || String(event.orderId) === String(orderId)) refresh();
  }), [orderId, refresh]);

  const perform = async (action, successMessage) => {
    setSaving(true);
    try { await action(); await refresh(); toast.success(successMessage); return true; }
    catch (error) { toast.error(getError(error, "The action could not be completed.")); return false; }
    finally { setSaving(false); }
  };
  const items = Array.isArray(order?.items) ? order.items : [];
  const issueNames = useMemo(() => new Map(data.issues.map((issue) => [String(issue._id), issue.issue_type])), [data.issues]);
  const receiptStatus = (receipt) => {
    const charge = data.charges.find((entry) => String(entry._id) === String(receipt.extra_charge));
    const paid = (charge?.payments || []).filter((entry) => entry.status === "verified").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return paid >= Number(receipt.total) ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
  };
  const receiptSnapshot = (receipt) => ({ ...receipt, payment_status: receiptStatus(receipt), payments: data.charges.find((entry) => String(entry._id) === String(receipt.extra_charge))?.payments || [] });

  const saveIssue = async (event) => {
    event.preventDefault();
    if (!issueDraft.issue_type.trim() || !issueDraft.description.trim()) return toast.error("Issue type and description are required.");
    await perform(async () => {
      let evidence_urls = [];
      if (issueDraft.files.length) {
        const uploaded = await uploadFiles(issueDraft.files, undefined, { purpose: "progress-media" });
        evidence_urls = (uploaded.files || []).map((file) => file.url).filter(Boolean);
      }
      await createInstallationIssue(orderId, { ...issueDraft, item_index: issueDraft.item_index === "" ? null : Number(issueDraft.item_index), evidence_urls, files: undefined });
      setIssueDraft({ issue_type: "", item_index: "", description: "", measurement_details: "", required_action: "", files: [] });
      setShowIssueForm(false);
    }, "Installation issue recorded.");
  };
  const saveCharge = async (event) => {
    event.preventDefault();
    if (!chargeDraft.description.trim() || !chargeDraft.reason.trim()) return toast.error("Charge description and reason are required.");
    await perform(async () => {
      const itemsPayload = chargeDraft.items.map((item) => ({ ...item, quantity: Number(item.quantity), unit_price: Number(item.unit_price) }));
      let evidence_urls = [];
      if (chargeDraft.files.length) {
        const uploaded = await uploadFiles(chargeDraft.files, undefined, { purpose: "progress-media" });
        evidence_urls = (uploaded.files || []).map((file) => file.url).filter(Boolean);
      }
      await createExtraCharge(orderId, { ...chargeDraft, files: undefined, evidence_urls, installation_issue: chargeDraft.installation_issue || null, item_index: chargeDraft.item_index === "" ? null : Number(chargeDraft.item_index), items: itemsPayload });
      setChargeDraft({ installation_issue: "", item_index: "", description: "", reason: "", customer_chargeable: false, notes: "", files: [], items: [{ description: "", category: "Labor", quantity: 1, unit_price: "" }] });
      setShowChargeForm(false);
    }, "Extra charge saved as draft.");
  };
  const submitPayment = async (charge) => {
    const value = paymentDrafts[charge._id];
    if (!(Number(value) > 0)) return toast.error("Enter a payment amount greater than zero.");
    paymentRequestIds.current[charge._id] ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const paymentInfo = paymentDetails[charge._id] || {};
    const ok = await perform(() => recordExtraChargePayment(orderId, charge._id, { request_id: paymentRequestIds.current[charge._id], amount: Number(value), method: paymentInfo.method || "Cash", reference: paymentInfo.reference || "", action: "record" }), "Extra charge payment recorded for verification.");
    if (ok) {
      delete paymentRequestIds.current[charge._id];
      setPaymentDrafts((current) => ({ ...current, [charge._id]: "" }));
    }
  };

  if (!canView) return null;

  return (
    <section className={`mt-4 rounded-xl border p-3 sm:p-4 ${panelClass}`} aria-labelledby="installation-billing-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="installation-billing-title" className="text-sm font-bold">Installation issues and extra charges</h3><p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Issues, approvals, receipts, and charge payments are tracked separately.</p></div>
        {isStaff && <div className="flex gap-2"><button type="button" onClick={() => setShowIssueForm((value) => !value)} className="rounded-lg border px-3 py-2 text-xs font-semibold">{showIssueForm ? "Close issue form" : "Report issue"}</button>{isAdmin && <button type="button" onClick={() => setShowChargeForm((value) => !value)} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white">{showChargeForm ? "Close charge form" : "Add extra charge"}</button>}</div>}
      </div>
      {(isAdmin || isCustomer) && data.balance && <div className={`mt-3 grid grid-cols-2 gap-2 rounded-lg p-3 text-xs sm:grid-cols-4 ${darkMode ? "bg-slate-800" : "bg-slate-50"}`}><div><span className="opacity-70">Original contract</span><p className="mt-1 font-bold">{money(data.balance.original_contract_amount)}</p></div><div><span className="opacity-70">Original outstanding</span><p className="mt-1 font-bold">{money(data.balance.original_outstanding)}</p></div><div><span className="opacity-70">Approved extra charges</span><p className="mt-1 font-bold">{money(data.balance.approved_extra_charges)}</p></div><div><span className="opacity-70">Verified extra charge payments</span><p className="mt-1 font-bold">{money(data.balance.verified_extra_charge_payments)}</p></div><div className="col-span-2 border-t pt-2 sm:col-span-4"><span className="opacity-70">Current total outstanding</span><p className="mt-1 font-bold text-red-600 dark:text-red-300">{money(data.balance.current_total_outstanding)}</p></div></div>}
      {showIssueForm && isStaff && <form onSubmit={saveIssue} className={`mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
        <label className="text-xs font-semibold">Issue type<input className={`${fieldClass} mt-1`} value={issueDraft.issue_type} onChange={(e) => setIssueDraft({ ...issueDraft, issue_type: e.target.value })} placeholder="Enter issue type" maxLength={120} required /></label>
        <label className="text-xs font-semibold">Affected product<select className={`${fieldClass} mt-1`} value={issueDraft.item_index} onChange={(e) => setIssueDraft({ ...issueDraft, item_index: e.target.value })}><option value="">Project / all items</option>{items.map((item, index) => <option key={item._id || index} value={index}>{item.name || `Item ${index + 1}`}</option>)}</select></label>
        <label className="text-xs font-semibold sm:col-span-2">Description<textarea className={`${fieldClass} mt-1`} value={issueDraft.description} onChange={(e) => setIssueDraft({ ...issueDraft, description: e.target.value })} maxLength={4000} required rows={2} /></label>
        <label className="text-xs font-semibold">Measurement details<textarea className={`${fieldClass} mt-1`} value={issueDraft.measurement_details} onChange={(e) => setIssueDraft({ ...issueDraft, measurement_details: e.target.value })} rows={2} /></label>
        <label className="text-xs font-semibold">Required action<textarea className={`${fieldClass} mt-1`} value={issueDraft.required_action} onChange={(e) => setIssueDraft({ ...issueDraft, required_action: e.target.value })} rows={2} /></label>
        {canUploadEvidence && <label className="text-xs font-semibold sm:col-span-2">Photos / evidence<input className={`${fieldClass} mt-1`} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple onChange={(e) => setIssueDraft({ ...issueDraft, files: Array.from(e.target.files || []).slice(0, 10) })} /><span className="mt-1 block font-normal opacity-70">Up to 10 files. Images and PDF are supported.</span></label>}
        <div className="sm:col-span-2"><button disabled={saving} className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Record issue"}</button></div>
      </form>}
      {showChargeForm && isAdmin && <form onSubmit={saveCharge} className={`mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
        <label className="text-xs font-semibold sm:col-span-2">Charge description<input className={`${fieldClass} mt-1`} value={chargeDraft.description} onChange={(e) => setChargeDraft({ ...chargeDraft, description: e.target.value })} maxLength={1000} required /></label>
        <label className="text-xs font-semibold">Related issue (optional)<select className={`${fieldClass} mt-1`} value={chargeDraft.installation_issue} onChange={(e) => setChargeDraft({ ...chargeDraft, installation_issue: e.target.value })}><option value="">None</option>{data.issues.map((issue) => <option key={issue._id} value={issue._id}>{issue.issue_type} · {issue.status}</option>)}</select></label>
        <label className="text-xs font-semibold">Affected product<select className={`${fieldClass} mt-1`} value={chargeDraft.item_index} onChange={(e) => setChargeDraft({ ...chargeDraft, item_index: e.target.value })}><option value="">Project / all items</option>{items.map((item, index) => <option key={item._id || index} value={index}>{item.name || `Item ${index + 1}`}</option>)}</select></label>
        <label className="text-xs font-semibold sm:col-span-2">Reason for additional charge<textarea className={`${fieldClass} mt-1`} value={chargeDraft.reason} onChange={(e) => setChargeDraft({ ...chargeDraft, reason: e.target.value })} maxLength={2000} required rows={2} /></label>
        <label className="flex items-start gap-2 text-xs font-semibold sm:col-span-2"><input type="checkbox" checked={chargeDraft.customer_chargeable} onChange={(e) => setChargeDraft({ ...chargeDraft, customer_chargeable: e.target.checked })} required className="mt-0.5" /><span>I assessed the cause and confirm this additional work is chargeable to the customer. Company measurement or installation errors must not be passed on without an authorized assessment.</span></label>
        <div className="sm:col-span-2"><p className="mb-2 text-xs font-bold">Charge items</p>{chargeDraft.items.map((item, index) => <div key={index} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><input className={fieldClass} placeholder="Item description" value={item.description} onChange={(e) => setChargeDraft({ ...chargeDraft, items: chargeDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, description: e.target.value } : row) })} required /><select className={fieldClass} value={item.category} onChange={(e) => setChargeDraft({ ...chargeDraft, items: chargeDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, category: e.target.value } : row) })}><option>Labor</option><option>Materials</option><option>Adjustment</option><option>Return visit</option><option>Other</option></select><input className={fieldClass} type="number" min="0.001" step="any" aria-label="Quantity" value={item.quantity} onChange={(e) => setChargeDraft({ ...chargeDraft, items: chargeDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row) })} required /><input className={fieldClass} type="number" min="0" step="0.01" placeholder="Unit price" aria-label="Unit price" value={item.unit_price} onChange={(e) => setChargeDraft({ ...chargeDraft, items: chargeDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, unit_price: e.target.value } : row) })} required /></div>)}<button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setChargeDraft({ ...chargeDraft, items: [...chargeDraft.items, { description: "", category: "Labor", quantity: 1, unit_price: "" }] })}>+ Add charge item</button><p className="mt-2 text-xs">Total: <strong>{money(chargeDraft.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0))}</strong></p></div>
        <label className="text-xs font-semibold sm:col-span-2">Supporting image or document<input className={`${fieldClass} mt-1`} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple onChange={(e) => setChargeDraft({ ...chargeDraft, files: Array.from(e.target.files || []).slice(0, 10) })} /></label>
        <label className="text-xs font-semibold sm:col-span-2">Internal notes<textarea className={`${fieldClass} mt-1`} value={chargeDraft.notes} onChange={(e) => setChargeDraft({ ...chargeDraft, notes: e.target.value })} maxLength={2000} rows={2} /></label>
        <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save draft</button></div>
      </form>}

      {loading ? <p className="mt-3 text-xs opacity-70">Loading records…</p> : <>
        {data.items.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide opacity-70">Per-product installation status</h4>{data.items.map((item, itemIndex) => <div key={`${item.name}-${itemIndex}`} className={`rounded-lg border p-2 ${darkMode ? "border-slate-700" : "border-slate-200"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{item.name || `Item ${itemIndex + 1}`}</span>{isStaff ? <select aria-label={`Installation status for ${item.name || `item ${itemIndex + 1}`}`} className={fieldClass} value={item.installation_status} disabled={saving} onChange={(event) => perform(() => updateInstallationStatus(orderId, { item_index: itemIndex, status: event.target.value }), "Installation status updated.")}><option>Not Started</option><option>Installation in Progress</option><option>Installed</option><option>For Adjustment</option><option>Installation Completed</option></select> : <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-900">{item.installation_status}</span>}</div>{item.installation_status_history?.length > 0 && <p className="mt-1 text-[10px] opacity-60">Updated {new Date(item.installation_status_history.at(-1).changed_at).toLocaleString()} by {item.installation_status_history.at(-1).changed_by_name || "staff"}</p>}</div>)}</div>}
        <div className="mt-4 space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide opacity-70">Installation issues</h4>{data.issues.length === 0 ? <p className="text-xs opacity-60">No reported issues.</p> : data.issues.map((issue) => <article key={issue._id} className={`rounded-lg border p-3 ${darkMode ? "border-slate-700" : "border-slate-200"}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{issue.issue_type}</strong><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">{issue.status}</span></div><p className="mt-1 whitespace-pre-wrap text-xs">{issue.description}</p><p className="mt-1 text-[10px] opacity-60">Affected product: {issue.item_index === null || issue.item_index === undefined ? "Project installation" : items[issue.item_index]?.name || `Item ${Number(issue.item_index) + 1}`} · Reported {new Date(issue.createdAt).toLocaleDateString()} by {issue.reported_by_name || "Staff"}</p>{issue.measurement_details && <p className="mt-1 text-xs opacity-75">Measurements: {issue.measurement_details}</p>}{issue.required_action && <p className="mt-1 text-xs opacity-75">Action: {issue.required_action}</p>}{issue.evidence_urls?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{issue.evidence_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">Evidence {index + 1}</a>)}</div>}{issue.return_visit?.date && <p className="mt-2 text-xs">Return visit: {new Date(issue.return_visit.date).toLocaleDateString()} {issue.return_visit.time} · {issue.return_visit.reason}</p>}{issue.history?.length > 0 && <ul className="mt-2 space-y-1 border-t pt-2 text-[10px] opacity-70">{issue.history.map((entry, index) => <li key={entry._id || `${entry.status}-${index}`}>{entry.status} · {new Date(entry.changed_at).toLocaleString()} by {entry.changed_by_name || "Staff"}</li>)}</ul>}{isStaff && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select aria-label="Issue status" className={fieldClass} value={returnDrafts[issue._id]?.status || issue.status} onChange={(e) => { const status = e.target.value; if (status === "Return Visit Required") setReturnDrafts((current) => ({ ...current, [issue._id]: { ...(current[issue._id] || {}), status } })); else perform(async () => { await updateInstallationIssue(orderId, issue._id, { status }); setReturnDrafts((current) => { const next = { ...current }; delete next[issue._id]; return next; }); }, "Issue status updated."); }}><option>{issue.status}</option>{issueStatuses.filter((status) => status !== issue.status).map((status) => <option key={status}>{status}</option>)}</select>{(issue.status === "Return Visit Required" || returnDrafts[issue._id]?.status === "Return Visit Required") && <><input aria-label="Return visit date" type="date" className={fieldClass} value={returnDrafts[issue._id]?.date || issue.return_visit?.date?.slice(0, 10) || ""} onChange={(e) => setReturnDrafts((current) => ({ ...current, [issue._id]: { ...current[issue._id], date: e.target.value } }))} /><input aria-label="Return visit time" required type="time" className={fieldClass} value={returnDrafts[issue._id]?.time || issue.return_visit?.time || ""} onChange={(e) => setReturnDrafts((current) => ({ ...current, [issue._id]: { ...current[issue._id], time: e.target.value } }))} /><input aria-label="Return visit reason" className={`${fieldClass} sm:col-span-2`} placeholder="Return visit reason" value={returnDrafts[issue._id]?.reason ?? issue.return_visit?.reason ?? ""} onChange={(e) => setReturnDrafts((current) => ({ ...current, [issue._id]: { ...current[issue._id], reason: e.target.value } }))} /><button type="button" className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => { const draft = returnDrafts[issue._id] || {}; const reason = draft.reason || issue.return_visit?.reason || ""; if (!draft.date && !issue.return_visit?.date) return toast.error("Choose a return visit date."); if (!draft.time && !issue.return_visit?.time) return toast.error("Choose a return visit time."); if (!reason.trim()) return toast.error("Enter a reason for the return visit."); perform(async () => { await updateInstallationIssue(orderId, issue._id, { status: "Return Visit Required", return_visit: { date: draft.date || issue.return_visit?.date, time: draft.time || issue.return_visit?.time, reason } }); setReturnDrafts((current) => { const next = { ...current }; delete next[issue._id]; return next; }); }, "Return visit saved."); }}>Save return</button></>}</div>}</article>)}</div>

        {isAdmin && <div className="mt-4 space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide opacity-70">Extra charge review</h4>{data.charges.length === 0 ? <p className="text-xs opacity-60">No extra charges.</p> : data.charges.map((charge) => { const paid = (charge.payments || []).filter((entry) => entry.status === "verified").reduce((sum, entry) => sum + Number(entry.amount || 0), 0); const receipt = data.receipts.find((entry) => String(entry._id) === String(charge.receipt)); return <article key={charge._id} className={`rounded-lg border p-3 ${darkMode ? "border-slate-700" : "border-slate-200"}`}><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{charge.description}</strong><span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-900">{charge.status}</span></div><p className="mt-1 text-xs">Reason: {charge.reason}</p><p className="mt-1 text-[10px] opacity-60">Affected product: {charge.item_index === null || charge.item_index === undefined ? "Project installation" : items[charge.item_index]?.name || `Item ${Number(charge.item_index) + 1}`} · Recorded by {charge.recorded_by_name}</p><p className="mt-1 text-xs">{charge.items?.map((item) => `${item.description} (${item.quantity} × ${money(item.unit_price)})`).join(" · ")}</p>{charge.evidence_urls?.length > 0 && <div className="mt-1 flex flex-wrap gap-2">{charge.evidence_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">Supporting file {index + 1}</a>)}</div>}<p className="mt-1 text-sm font-bold">Total: {money(charge.total)} · Remaining: {money(Math.max(Number(charge.total) - paid, 0))}</p>{charge.approved_by_name && <p className="mt-1 text-[10px] opacity-60">Approved by {charge.approved_by_name} · {charge.approved_at ? new Date(charge.approved_at).toLocaleString() : ""}</p>}{charge.installation_issue && <p className="mt-1 text-xs opacity-70">Related issue: {issueNames.get(String(charge.installation_issue)) || "Installation issue"}</p>}
          {isAdmin && <div className="mt-3 flex flex-wrap gap-2">{charge.status === "Draft" && <button type="button" disabled={saving} className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => perform(() => submitExtraCharge(orderId, charge._id), "Charge submitted for approval.")}>Submit for approval</button>}{charge.status === "Pending Approval" && <><button type="button" disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => perform(() => reviewExtraCharge(orderId, charge._id, { decision: "approve" }), "Extra charge approved.")}>Approve</button><input className={`${fieldClass} max-w-64`} placeholder="Decline reason (required)" value={declineReasons[charge._id] || ""} onChange={(e) => setDeclineReasons((current) => ({ ...current, [charge._id]: e.target.value }))} /><button type="button" disabled={saving || !declineReasons[charge._id]?.trim()} className="rounded-lg border border-red-400 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50" onClick={() => perform(() => reviewExtraCharge(orderId, charge._id, { decision: "decline", reason: declineReasons[charge._id] }), "Charge declined.")}>Decline</button></>}{charge.status === "Approved" && <button type="button" disabled={saving} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => setReceiptForReview({ charge, balance: data.balance })}>Issue Extra Charge Receipt</button>}</div>}
          {receipt && <div className={`mt-3 rounded-lg p-3 text-xs ${darkMode ? "bg-slate-800" : "bg-slate-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong>Receipt {receipt.receipt_number}</strong><span>{receiptStatus(receipt)}</span></div><p className="mt-1">Issued {new Date(receipt.issued_at).toLocaleDateString()} · {money(receipt.total)}</p><button type="button" className="mt-2 rounded-lg border px-3 py-2 font-semibold" onClick={() => downloadExtraChargeReceipt(receiptSnapshot(receipt)).catch(() => toast.error("Could not create the receipt PDF."))}>Download / print receipt PDF</button></div>}
          {receipt && <div className="mt-3 grid gap-2 sm:grid-cols-4"><input aria-label="Extra charge payment amount" type="number" min="0.01" step="0.01" max={Math.max(Number(charge.total) - paid, 0)} placeholder="Payment amount" className={fieldClass} value={paymentDrafts[charge._id] || ""} onChange={(e) => setPaymentDrafts((current) => ({ ...current, [charge._id]: e.target.value }))} /><select aria-label="Extra charge payment method" className={fieldClass} value={paymentDetails[charge._id]?.method || "Cash"} onChange={(e) => setPaymentDetails((current) => ({ ...current, [charge._id]: { ...current[charge._id], method: e.target.value } }))}><option>Cash</option><option>Bank transfer</option><option>GCash</option><option>Check</option><option>Other</option></select><input aria-label="Payment reference" placeholder="Payment reference" className={fieldClass} value={paymentDetails[charge._id]?.reference || ""} onChange={(e) => setPaymentDetails((current) => ({ ...current, [charge._id]: { ...current[charge._id], reference: e.target.value } }))} /><button type="button" disabled={saving} className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => submitPayment(charge)}>Record payment</button></div>}
          {isAdmin && (charge.payments || []).filter((entry) => entry.status === "pending").map((payment) => <div key={payment._id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 p-2 text-xs"><span>Unverified payment: {money(payment.amount)} · {payment.method}</span><button type="button" disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white" onClick={() => perform(() => verifyExtraChargePayment(orderId, charge._id, payment._id), "Extra charge payment verified.")}>Verify payment</button></div>)}
        </article>; })}</div>}
        {isCustomer && <div className="mt-4 space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide opacity-70">Approved extra charges and receipts</h4>{data.charges.length === 0 ? <p className="text-xs opacity-60">No approved extra charges.</p> : data.charges.map((charge) => { const receipt = data.receipts.find((entry) => String(entry._id) === String(charge.receipt)); return <article key={charge._id} className={`rounded-lg border p-3 ${darkMode ? "border-slate-700" : "border-slate-200"}`}><strong className="text-sm">{charge.description}</strong><p className="mt-1 text-xs">Reason: {charge.reason}</p><p className="mt-1 text-xs opacity-70">Affected product: {charge.item_index === null || charge.item_index === undefined ? "Project installation" : items[charge.item_index]?.name || `Item ${Number(charge.item_index) + 1}`}</p><p className="mt-1 font-bold">{money(charge.total)} · {receipt ? receiptStatus(receipt) : "Approved"}</p>{charge.evidence_urls?.length > 0 && <div className="mt-1 flex gap-2">{charge.evidence_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">Supporting file {index + 1}</a>)}</div>}{receipt && <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => downloadExtraChargeReceipt(receiptSnapshot(receipt)).catch(() => toast.error("Could not create the receipt PDF."))}>Download receipt</button>}</article>; })}</div>}
      </>}

      {receiptForReview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="extra-charge-confirm-title" className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${panelClass}`}><h4 id="extra-charge-confirm-title" className="text-base font-bold">Confirm Extra Charge Receipt</h4><p className="mt-2 text-sm">{receiptForReview.charge.description}</p><div className={`mt-3 space-y-2 rounded-lg p-3 text-sm ${darkMode ? "bg-slate-800" : "bg-slate-50"}`}><div className="flex justify-between gap-2"><span>Original remaining balance</span><strong>{money(receiptForReview.balance?.original_outstanding)}</strong></div><div className="flex justify-between gap-2"><span>Approved extra charge</span><strong>{money(receiptForReview.charge.total)}</strong></div><div className="flex justify-between gap-2 border-t pt-2"><span>Updated amount due</span><strong>{money(receiptForReview.balance?.current_total_outstanding)}</strong></div></div><p className="mt-2 text-xs opacity-70">Issuing the receipt does not mark this charge as paid.</p><div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => setReceiptForReview(null)}>Cancel</button><button type="button" disabled={saving} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => perform(async () => { await issueExtraChargeReceipt(orderId, receiptForReview.charge._id); setReceiptForReview(null); }, "Extra charge receipt issued.")}>Confirm and issue</button></div></section></div>}
    </section>
  );
}
