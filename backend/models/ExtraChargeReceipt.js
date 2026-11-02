import mongoose from "mongoose";

const ExtraChargeReceiptSchema = new mongoose.Schema({
  receipt_type: { type: String, enum: ["Extra Charge Receipt"], default: "Extra Charge Receipt" },
  receipt_number: { type: String, required: true, unique: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  extra_charge: { type: mongoose.Schema.Types.ObjectId, ref: "ExtraCharge", required: true, unique: true, index: true },
  customer_name: { type: String, trim: true, default: "" },
  customer_contact: { type: String, trim: true, default: "" },
  project_reference: { type: String, trim: true, default: "" },
  item_index: { type: Number, min: 0, default: null },
  affected_item: { type: String, trim: true, default: "Project installation" },
  items: { type: [mongoose.Schema.Types.Mixed], required: true },
  description: { type: String, required: true },
  reason: { type: String, required: true },
  total: { type: Number, required: true, min: 0 },
  previous_outstanding: { type: Number, required: true, min: 0 },
  updated_outstanding_at_issue: { type: Number, required: true, min: 0 },
  issued_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  issued_by_name: { type: String, trim: true, default: "" },
  issued_at: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model("ExtraChargeReceipt", ExtraChargeReceiptSchema);
