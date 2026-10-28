import mongoose from "mongoose";

const SuperAdminPromotionAuditSchema = new mongoose.Schema({
  action: { type: String, enum: ["staff_promoted_to_super_admin", "super_admin_demoted_to_staff"], required: true },
  outcome: { type: String, enum: ["initiated", "succeeded", "rejected"], required: true },
  actor_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  actor_email: { type: String, required: true },
  target_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  target_email: { type: String, required: true },
  previous_role: { type: String, required: true },
  new_role: { type: String, required: true },
  reason: { type: String, default: "" },
}, { timestamps: true });

export default mongoose.model("SuperAdminPromotionAudit", SuperAdminPromotionAuditSchema);
