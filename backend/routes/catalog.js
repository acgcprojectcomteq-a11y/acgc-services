import express from "express";
import { authMiddleware, roleMiddleware, staffModulePermission } from "../middleware/auth.js";
import * as catalogCtrl from "../controllers/catalogController.js";

const router = express.Router();
const productWrite = (action) => [authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("product_management", action)];

// Types
router.get("/types", catalogCtrl.getTypes);
router.post("/types", ...productWrite("add"), catalogCtrl.createType);
router.put("/types/:id", ...productWrite("edit"), catalogCtrl.updateType);
router.delete("/types/:id", ...productWrite("delete"), catalogCtrl.deleteType);

// Names
router.get("/names", catalogCtrl.getNames);
router.post("/names", ...productWrite("add"), catalogCtrl.createName);
router.put("/names/:id", ...productWrite("edit"), catalogCtrl.updateName);
router.delete("/names/:id", ...productWrite("delete"), catalogCtrl.deleteName);

// Variants
router.get("/variants", catalogCtrl.getVariants);
router.post("/variants", ...productWrite("add"), catalogCtrl.createVariant);
router.put("/variants/:id", ...productWrite("edit"), catalogCtrl.updateVariant);
router.delete("/variants/:id", ...productWrite("delete"), catalogCtrl.deleteVariant);

// Categories
router.get("/categories", catalogCtrl.getCategories);
router.post("/categories", ...productWrite("add"), catalogCtrl.createCategory);
router.put("/categories/:id", ...productWrite("edit"), catalogCtrl.updateCategory);
router.delete("/categories/:id", ...productWrite("delete"), catalogCtrl.deleteCategory);

// Usage check
router.get("/usage/:kind/:id", ...productWrite("view"), catalogCtrl.checkUsage);

export default router;
