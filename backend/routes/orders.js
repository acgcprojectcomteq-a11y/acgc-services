import express from "express";
import { authMiddleware, optionalAuthMiddleware, permissionMiddleware, roleMiddleware, staffModulePermission } from "../middleware/auth.js";
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

const router = express.Router();

router.get("/", authMiddleware, listOrders);
router.post("/", authMiddleware, roleMiddleware("customer"), permissionMiddleware("can_request_orders"), createOrder);
router.get("/track/:tracking", optionalAuthMiddleware, permissionMiddleware("can_track_products"), trackOrder);
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
router.put("/admin/:orderId/project-delay", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("progress_monitoring", "edit"), updateProjectDelay);
router.put("/admin/:orderId/protected-project-notes", authMiddleware, roleMiddleware(["admin", "super_admin"]), staffModulePermission("progress_monitoring", "edit"), updateProtectedProjectNotes);
router.post("/admin/:orderId/activity-notes", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("progress_monitoring", "edit"), addProgressActivityNote);
router.post("/admin/:orderId/contract", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("site_inspection", "generate_contract"), generateContract);
router.post("/admin/:orderId/send-contract-email", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("site_inspection", "send_email"), sendWalkInApprovalEmail);

export default router;
