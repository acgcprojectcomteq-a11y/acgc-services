import mongoose from "mongoose";

const ReceiptSendAttemptSchema = new mongoose.Schema({
  attempt_id: { type: String, required: true },
  status: { type: String, enum: ["Sending", "Sent", "Failed"], required: true },
  attempted_at: { type: Date, required: true },
  completed_at: { type: Date, default: null },
  admin_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  recipient_email: { type: String, trim: true, lowercase: true, default: "" },
  provider: { type: String, trim: true, default: "" },
  provider_message_id: { type: String, trim: true, default: "" },
  error: { type: String, trim: true, default: "" },
}, { _id: false });

const ProjectPaymentReceiptSchema = new mongoose.Schema({
  receipt_type: { type: String, enum: ["Project Payment Receipt"], default: "Project Payment Receipt" },
  receipt_number: { type: String, required: true, unique: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  customer_name: { type: String, trim: true, default: "" },
  customer_contact: { type: String, trim: true, default: "" },
  project_reference: { type: String, trim: true, default: "" },
  settlement_key: { type: String, required: true },
  project_items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  extra_charges: { type: [mongoose.Schema.Types.Mixed], default: [] },
  original_project_amount: { type: Number, min: 0, required: true },
  total_extra_charges: { type: Number, min: 0, required: true },
  total_project_charges: { type: Number, min: 0, required: true },
  total_verified_payments: { type: Number, min: 0, required: true },
  remaining_balance: { type: Number, min: 0, required: true },
  issued_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  issued_by_name: { type: String, trim: true, default: "" },
  issued_at: { type: Date, default: Date.now },
  send_status: { type: String, enum: ["Not Sent", "Sending", "Sent", "Failed"], default: "Not Sent", index: true },
  recipient_email: { type: String, trim: true, lowercase: true, default: "" },
  sent_at: { type: Date, default: null },
  sent_by: { type: mongoose.Schema.Types.ObjectId, default: null },
  provider_delivery_status: { type: String, enum: ["not_attempted", "pending", "accepted", "failed"], default: "not_attempted" },
  provider_name: { type: String, trim: true, default: "" },
  provider_message_id: { type: String, trim: true, default: "" },
  send_error: { type: String, trim: true, default: "" },
  send_attempts: { type: Number, min: 0, default: 0 },
  send_history: { type: [ReceiptSendAttemptSchema], default: [] },
}, { timestamps: true });

ProjectPaymentReceiptSchema.index({ order: 1, settlement_key: 1 }, { unique: true });

export default mongoose.model("ProjectPaymentReceipt", ProjectPaymentReceiptSchema);
