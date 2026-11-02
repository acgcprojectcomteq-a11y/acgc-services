import express from "express";
import multer from "multer";
import { authMiddleware, optionalAuthMiddleware, permissionMiddleware, roleMiddleware, staffModulePermission, staffModulePermissionIfStaff } from "../middleware/auth.js";
import {
  createOrder,
  createOrderAsAdmin,
  listOrders,
  trackOrder,
  getCustomerFeedbackSummary,
  getProductReviewSummaries,
  getProductReviewSummary,
  getProductReviews,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  cancelAdminOrder,
  updateOrderInspection,
  updateOrderProgress,
  updateProjectDelay,
  updateProtectedProjectNotes,
  addProgressActivityNote,
  generateContract,
  submitOrderReview,
  deleteOrderReview,
  setOrderReviewVisibility,
  respondToCustomerReview,
  respondToContract,
  cancelCustomerOrder,
  submitCustomerPaymentProof,
  addAdminPaymentSupportingDocument,
  viewAdminPaymentSupportingDocument,
  viewCustomerPaymentSupportingDocument,
  respondToInstallationSchedule,
  sendWalkInApprovalEmail,
} from "../controllers/orderController.js";
import { paymentProofUploadMiddleware } from "../controllers/uploadController.js";
import { generateTransactionReport } from "../controllers/reportController.js";
import {
  listInstallationBilling,
  updateInstallationIssue,
  createExtraCharge,
  getExtraChargeReceiptSendStatus,
  sendExtraChargeReceiptToCustomer,
  updateInstallationStatus,
} from "../controllers/installationBillingController.js";
import {
  createOrGetProjectPaymentReceipt,
  getProjectPaymentReceiptSendStatus,
  sendProjectPaymentReceiptToCustomer,
  getCustomerProjectPaymentReceipt,
} from "../controllers/projectReceiptController.js";

const router = express.Router();
const receiptPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "application/pdf") return callback(new Error("Attach the generated receipt as a PDF."));
    return callback(null, true);
  },
}).single("receipt_pdf");
const receiptPdfUploadMiddleware = (req, res, next) => receiptPdfUpload(req, res, (error) => {
  if (error) return res.status(400).json({ success: false, message: error.message || "The receipt PDF could not be uploaded." });
  return next();
});

router.get("/", authMiddleware, listOrders);
router.post("/", authMiddleware, roleMiddleware("customer"), permissionMiddleware("can_request_orders"), createOrder);
router.get("/track/:tracking", optionalAuthMiddleware, permissionMiddleware("can_track_products"), trackOrder);
router.get("/:orderId/installation-billing", authMiddleware, roleMiddleware(["customer", "admin", "super_admin", "skilled_worker"]), staffModulePermissionIfStaff("progress_monitoring", "view"), listInstallationBilling);
router.get("/:orderId/project-payment-receipts/:receiptId", authMiddleware, roleMiddleware("customer"), getCustomerProjectPaymentReceipt);
router.put("/:orderId/contract", authMiddleware, roleMiddleware("customer"), respondToContract);
router.put("/:orderId/cancel", authMiddleware, roleMiddleware("customer"), cancelCustomerOrder);
router.put("/:orderId/payment-proof", authMiddleware, roleMiddleware("customer"), submitCustomerPaymentProof);
router.get(
  "/:orderId/payment-records/:recordId/documents/:documentId",
  authMiddleware,
  roleMiddleware("customer"),
  viewCustomerPaymentSupportingDocument,
);
router.put("/:orderId/installation-schedule", authMiddleware, respondToInstallationSchedule);
router.put("/:orderId/review", authMiddleware, roleMiddleware("customer"), permissionMiddleware("can_upload_feedback"), submitOrderReview);
router.get("/reviews/summary", getCustomerFeedbackSummary);
router.get("/reviews/products/summary", getProductReviewSummaries);
router.get("/reviews/product/:productId/summary", getProductReviewSummary);
router.get("/reviews/product/:productId", optionalAuthMiddleware, permissionMiddleware("can_upload_feedback"), getProductReviews);

// Admin routes
const orderReadModules = ["dashboard", "site_inspection", "transactions", "progress_monitoring"];
const orderReadModule = (req) => orderReadModules.includes(req.query.module || req.query.view) ? (req.query.module || req.query.view) : "";
router.get("/admin/list", authMiddleware, staffModulePermission(orderReadModule, "view"), getAdminOrders);
router.get("/admin/reports", authMiddleware, roleMiddleware(["admin", "super_admin"]), generateTransactionReport);
router.get("/admin/:orderId", authMiddleware, staffModulePermission(orderReadModule, (req) => (req.query.module || req.query.view) === "dashboard" ? "view" : "view_details"), getAdminOrderById);
router.post("/admin/create", authMiddleware, roleMiddleware("admin"), createOrderAsAdmin);
router.put("/admin/:orderId/cancel", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("transactions", "cancel"), cancelAdminOrder);
router.put("/admin/:orderId/status", authMiddleware, roleMiddleware("admin"), updateOrderStatus);
router.post(
  "/admin/:orderId/payment-records/:recordId/documents",
  authMiddleware,
  roleMiddleware(["admin", "super_admin"]),
  paymentProofUploadMiddleware,
  addAdminPaymentSupportingDocument,
);
router.get(
  "/admin/:orderId/payment-records/:recordId/documents/:documentId",
  authMiddleware,
  roleMiddleware(["admin", "super_admin"]),
  viewAdminPaymentSupportingDocument,
);
router.delete("/admin/:orderId/review", authMiddleware, roleMiddleware("admin"), deleteOrderReview);
router.put("/admin/:orderId/review/visibility", authMiddleware, roleMiddleware(["admin", "super_admin"]), setOrderReviewVisibility);
router.put("/admin/:orderId/review/response", authMiddleware, roleMiddleware(["admin", "super_admin"]), respondToCustomerReview);
router.put("/admin/:orderId/inspection", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("site_inspection", (req) => req.body?.inspection_status === "approved" || req.body?.inspection_status === "completed" ? "manual_approve" : "edit"), updateOrderInspection);
router.put("/admin/:orderId/progress", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("progress_monitoring", "edit"), updateOrderProgress);
router.put("/admin/:orderId/installation-status", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("progress_monitoring", "edit"), updateInstallationStatus);
router.put("/admin/:orderId/installation-issues/:issueId", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("progress_monitoring", "edit"), updateInstallationIssue);
router.post("/admin/:orderId/extra-charges", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("transactions", "edit"), createExtraCharge);
router.post("/admin/:orderId/project-payment-receipts", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("transactions", "edit"), createOrGetProjectPaymentReceipt);
router.get("/admin/:orderId/project-payment-receipts/:receiptId/send-status", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("transactions", "view"), getProjectPaymentReceiptSendStatus);
router.post("/admin/:orderId/project-payment-receipts/:receiptId/send", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("transactions", "edit"), receiptPdfUploadMiddleware, sendProjectPaymentReceiptToCustomer);
router.get("/admin/:orderId/extra-charge-receipts/:receiptId/send-status", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("transactions", "view"), getExtraChargeReceiptSendStatus);
router.post("/admin/:orderId/extra-charge-receipts/:receiptId/send", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("transactions", "edit"), receiptPdfUploadMiddleware, sendExtraChargeReceiptToCustomer);
router.put("/admin/:orderId/project-delay", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("progress_monitoring", "edit"), updateProjectDelay);
router.put("/admin/:orderId/protected-project-notes", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("progress_monitoring", "edit"), updateProtectedProjectNotes);
router.post("/admin/:orderId/activity-notes", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("progress_monitoring", "edit"), addProgressActivityNote);
router.post("/admin/:orderId/contract", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("site_inspection", "generate_contract"), generateContract);
router.post("/admin/:orderId/send-contract-email", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("site_inspection", "send_email"), sendWalkInApprovalEmail);

export default router;
