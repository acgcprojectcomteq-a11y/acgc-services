import express from "express";
import { authMiddleware, roleMiddleware, staffModulePermission, staffModulePermissionAny } from "../middleware/auth.js";
import uploadController, {
	paymentProofUploadMiddleware,
	productImageUploadMiddleware,
	progressMediaUploadMiddleware,
	reviewPhotoUploadMiddleware,
	uploadMiddleware,
} from "../controllers/uploadController.js";

const router = express.Router();

const cloudinaryStaffPermission = (req, res, next) => {
	if (req.user?.role !== "skilled_worker") return next();
	const permissionByPurpose = {
		"product-images": ["product_management", ["add", "edit"]],
		"progress-media": ["progress_monitoring", ["upload_progress_photo"]],
		contracts: ["site_inspection", ["generate_contract"]],
		"repair-evidence": ["repair_management", ["manage"]],
		"backup-import": ["settings", ["back_up"]],
	};
	const requirement = permissionByPurpose[req.body?.purpose];
	if (!requirement) return res.status(403).json({ success: false, message: "This staff upload purpose is disabled for your account." });
	return staffModulePermissionAny(requirement[0], requirement[1])(req, res, next);
};

router.post("/cloudinary-signature", authMiddleware, cloudinaryStaffPermission, uploadController.createCloudinaryUploadSignature);
router.post(
	"/product-images",
	authMiddleware,
	roleMiddleware(["admin", "super_admin", "skilled_worker"]),
	staffModulePermissionAny("product_management", ["add", "edit"]),
	productImageUploadMiddleware,
	uploadController.uploadProductImages
);
router.post(
	"/payment-proofs",
	authMiddleware,
	roleMiddleware(["customer", "admin", "super_admin"]),
	paymentProofUploadMiddleware,
	uploadController.uploadPaymentProof
);
router.post(
	"/review-photos",
	authMiddleware,
	roleMiddleware(["customer", "admin", "super_admin"]),
	reviewPhotoUploadMiddleware,
	uploadController.uploadReviewPhotos
);
router.post(
	"/progress-media",
	authMiddleware,
	roleMiddleware(["admin", "super_admin", "skilled_worker"]),
	staffModulePermission("progress_monitoring", "upload_progress_photo"),
	progressMediaUploadMiddleware,
	uploadController.uploadProgressMedia
);
router.post("/", authMiddleware, roleMiddleware(["admin", "super_admin"]), uploadMiddleware.any(), uploadController.uploadImages);

export default router;
