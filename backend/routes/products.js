import express from "express";
import { authMiddleware, roleMiddleware, staffModulePermission } from "../middleware/auth.js";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";

const router = express.Router();

router.get("/", listProducts);
router.get("/:id", authMiddleware, getProduct);
router.post("/", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("product_management", "add"), createProduct);
router.put("/:id", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("product_management", "edit"), updateProduct);
router.delete("/:id", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("product_management", "delete"), deleteProduct);

export default router;
