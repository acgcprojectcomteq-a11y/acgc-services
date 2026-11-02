import { apiFetch, API_BASE } from "./client";

export const getOrders = () => apiFetch("/orders", { cache: "no-store" });

const inFlightAdminOrderRequests = new Map();
const inFlightAdminOrderDetails = new Map();

export const getAdminOrders = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const path = `/orders/admin/list${query ? `?${query}` : ""}`;
  const existingRequest = inFlightAdminOrderRequests.get(path);
  if (existingRequest) return existingRequest;

  const request = apiFetch(path, { cache: "no-store" }).finally(() => {
    inFlightAdminOrderRequests.delete(path);
  });
  inFlightAdminOrderRequests.set(path, request);
  return request;
};

export const downloadTransactionReport = async (filters = {}) => {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString();
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE}/orders/admin/reports${query ? `?${query}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || "Unable to generate transaction report.");
    error.data = errorData;
    throw error;
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "ACGC_Transactions.xlsx";
  return { blob: await response.blob(), filename };
};

export const getAdminOrder = (orderId, module) => {
  const query = module ? `?module=${encodeURIComponent(module)}` : "";
  const path = `/orders/admin/${encodeURIComponent(orderId)}${query}`;
  const existingRequest = inFlightAdminOrderDetails.get(path);
  if (existingRequest) return existingRequest;

  const request = apiFetch(path, { cache: "no-store" }).finally(() => {
    inFlightAdminOrderDetails.delete(path);
  });
  inFlightAdminOrderDetails.set(path, request);
  return request;
};

export const getProductReviews = (productId) => apiFetch(`/orders/reviews/product/${encodeURIComponent(productId)}`);
export const getCustomerFeedbackSummary = () => apiFetch("/orders/reviews/summary", { cache: "no-store" });
export const getProductReviewSummaries = (productIds = []) => {
  const uniqueIds = [...new Set(productIds.filter(Boolean).map(String))];
  if (!uniqueIds.length) return Promise.resolve({ summaries: {} });
  const batches = Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, index) => uniqueIds.slice(index * 100, (index + 1) * 100));
  const fetchBatches = Promise.all(batches.map((batch) => {
    const query = new URLSearchParams();
    batch.forEach((productId) => query.append("productIds", productId));
    return apiFetch(`/orders/reviews/products/summary?${query}`, { cache: "no-store" });
  })).then((responses) => ({
    summaries: Object.assign({}, ...responses.map((response) => response.summaries || {})),
  }));

  return fetchBatches.catch(async (batchError) => {
    // Older deployed API instances may not have the batch route yet. Fall back
    // to the established per-product summary endpoint so product ratings keep
    // rendering during a staggered frontend/backend rollout.
    if (batchError?.status !== 404 && batchError?.statusCode !== 404 && batchError?.response?.status !== 404) {
      throw batchError;
    }

    const entries = await Promise.all(uniqueIds.map(async (productId) => {
      try {
        return [productId, await getProductReviewSummary(productId)];
      } catch {
        return [productId, null];
      }
    }));
    return { summaries: Object.fromEntries(entries.map(([productId, summary]) => [productId, summary || {}])) };
  });
};
export const getProductReviewSummary = (productId) =>
  apiFetch(`/orders/reviews/product/${encodeURIComponent(productId)}/summary`);

export const updateOrderStatus = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const cancelAdminOrder = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/cancel`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const updateOrderInspection = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/inspection`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const updateOrderProgress = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/progress`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const updateProjectDelay = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/project-delay`, { method: "PUT", body: JSON.stringify(payload) });
export const updateProtectedProjectNotes = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/protected-project-notes`, { method: "PUT", body: JSON.stringify(payload) });
export const addProgressActivityNote = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/activity-notes`, { method: "POST", body: JSON.stringify(payload) });

export const getInstallationBilling = (orderId) =>
  apiFetch(`/orders/${encodeURIComponent(orderId)}/installation-billing`, { cache: "no-store" });
export const updateInstallationStatus = (orderId, payload) =>
  apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/installation-status`, { method: "PUT", body: JSON.stringify(payload) });
export const updateInstallationIssue = (orderId, issueId, payload) =>
  apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/installation-issues/${encodeURIComponent(issueId)}`, { method: "PUT", body: JSON.stringify(payload) });
export const createExtraCharge = async (orderId, payload) => {
  const result = await apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/extra-charges`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (typeof window !== "undefined") {
    const savedOrderId = String(result?.order?._id || orderId || "");
    window.dispatchEvent(new CustomEvent("acgc:realtime", {
      detail: {
        area: "orders",
        action: "post",
        orderId: savedOrderId,
        timestamp: new Date().toISOString(),
      },
    }));
  }
  return result;
};

export const getExtraChargeReceiptSendStatus = (orderId, receiptId) =>
  apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/extra-charge-receipts/${encodeURIComponent(receiptId)}/send-status`, { cache: "no-store" });

export const createOrGetProjectPaymentReceipt = (orderId) =>
  apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/project-payment-receipts`, { method: "POST" });

export const getProjectPaymentReceiptSendStatus = (orderId, receiptId) =>
  apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/project-payment-receipts/${encodeURIComponent(receiptId)}/send-status`, { cache: "no-store" });

export const getCustomerProjectPaymentReceipt = (orderId, receiptId) =>
  apiFetch(`/orders/${encodeURIComponent(orderId)}/project-payment-receipts/${encodeURIComponent(receiptId)}`, { cache: "no-store" });

export const sendProjectPaymentReceiptToCustomer = async (orderId, receiptId, receiptPdf, expectedRecipientEmail = "") => {
  const body = new FormData();
  body.append("receipt_pdf", receiptPdf, `project-payment-receipt-${receiptId}.pdf`);
  body.append("expected_recipient_email", expectedRecipientEmail);
  const result = await apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/project-payment-receipts/${encodeURIComponent(receiptId)}/send`, {
    method: "POST",
    body,
    _retries: 1,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acgc:realtime", {
      detail: { area: "orders", action: "post", orderId: String(result?.order?._id || orderId || ""), timestamp: new Date().toISOString() },
    }));
  }
  return result;
};

export const sendExtraChargeReceiptToCustomer = async (orderId, receiptId, receiptPdf, expectedRecipientEmail = "") => {
  const body = new FormData();
  body.append("receipt_pdf", receiptPdf, `extra-charge-receipt-${receiptId}.pdf`);
  body.append("expected_recipient_email", expectedRecipientEmail);
  const result = await apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/extra-charge-receipts/${encodeURIComponent(receiptId)}/send`, {
    method: "POST",
    body,
    // The server may have submitted the email even if the HTTP response is lost.
    // Never automatically retry this non-idempotent provider operation.
    _retries: 1,
  });
  if (typeof window !== "undefined") {
    const savedOrderId = String(result?.order?._id || orderId || "");
    window.dispatchEvent(new CustomEvent("acgc:realtime", {
      detail: { area: "orders", action: "post", orderId: savedOrderId, timestamp: new Date().toISOString() },
    }));
  }
  return result;
};

export const respondToContract = (orderId, payload) =>
  apiFetch(`/orders/${orderId}/contract`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const acceptContract = (orderId) => respondToContract(orderId, { action: "accept" });
export const declineContract = (orderId) => respondToContract(orderId, { action: "decline" });
export const respondToInstallationSchedule = (orderId, payload) =>
  apiFetch(`/orders/${orderId}/installation-schedule`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const createOrder = (payload) =>
  apiFetch("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createInspection = (payload) =>
  apiFetch("/orders/admin/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const trackOrder = (tracking) => apiFetch(`/orders/track/${encodeURIComponent(tracking)}`);

export const generateContract = (orderId, payload = {}) =>
  apiFetch(`/orders/admin/${orderId}/contract`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const submitOrderReview = (orderId, payload = {}) =>
  apiFetch(`/orders/${orderId}/review`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteOrderReview = (orderId, itemIndex) =>
  apiFetch(`/orders/admin/${orderId}/review${Number.isInteger(itemIndex) ? `?itemIndex=${itemIndex}` : ""}`, {
    method: "DELETE",
  });

export const setOrderReviewVisibility = (orderId, { itemIndex, hiddenFromCustomers }) =>
  apiFetch(`/orders/admin/${orderId}/review/visibility`, {
    method: "PUT",
    body: JSON.stringify({ itemIndex, hiddenFromCustomers }),
  });

export const respondToCustomerReview = (orderId, { itemIndex, response }) =>
  apiFetch(`/orders/admin/${orderId}/review/response`, {
    method: "PUT",
    body: JSON.stringify({ itemIndex, response }),
  });

export const cancelCustomerOrder = (orderId, payload = {}) =>
  apiFetch(`/orders/${orderId}/cancel`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const sendWalkInApprovalEmail = (orderId, payload = {}) =>
  apiFetch(`/orders/admin/${orderId}/send-contract-email`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
