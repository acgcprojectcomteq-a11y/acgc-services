import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 300 },
  category: { type: String, trim: true, default: "Other" },
  quantity: { type: Number, required: true, min: 0.001 },
  unit_price: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
}, { _id: true });
const AuditSchema = new mongoose.Schema({ action: { type: String, required: true }, reason: { type: String, trim: true, default: "" }, by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, by_name: { type: String, trim: true, default: "" }, at: { type: Date, default: Date.now } }, { _id: true });
const PaymentSchema = new mongoose.Schema({ request_id: { type: String, required: true }, amount: { type: Number, required: true, min: 0.01 }, status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" }, method: { type: String, trim: true, default: "Cash" }, reference: { type: String, trim: true, default: "" }, recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, verified_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, recorded_at: { type: Date, default: Date.now }, verified_at: { type: Date, default: null } }, { _id: true });

const ExtraChargeSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  installation_issue: { type: mongoose.Schema.Types.ObjectId, ref: "InstallationIssue", default: null, index: true },
  item_index: { type: Number, min: 0, default: null },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  evidence_urls: { type: [String], default: [] },
  items: { type: [ItemSchema], validate: { validator: (items) => items.length > 0, message: "At least one charge item is required." } },
  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["Draft", "Pending Approval", "Approved", "Declined", "Receipt Generated"], default: "Draft", index: true },
  decline_reason: { type: String, trim: true, default: "" },
  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  recorded_by_name: { type: String, trim: true, default: "" },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approved_by_name: { type: String, trim: true, default: "" },
  approved_at: { type: Date, default: null },
  approval_history: { type: [AuditSchema], default: [] },
  payments: { type: [PaymentSchema], default: [] },
  receipt: { type: mongoose.Schema.Types.ObjectId, ref: "ExtraChargeReceipt", default: null, index: true },
}, { timestamps: true, optimisticConcurrency: true });

export default mongoose.model("ExtraCharge", ExtraChargeSchema);
