import mongoose from "mongoose";

const HistorySchema = new mongoose.Schema({
  status: { type: String, enum: ["Open", "Under Assessment", "For Adjustment", "Return Visit Required", "Resolved"], required: true },
  note: { type: String, trim: true, default: "" },
  changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  changed_by_name: { type: String, trim: true, default: "" },
  changed_at: { type: Date, default: Date.now },
}, { _id: true });

const InstallationIssueSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  item_index: { type: Number, min: 0, default: null },
  issue_type: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  measurement_details: { type: String, trim: true, maxlength: 2000, default: "" },
  evidence_urls: { type: [String], default: [] },
  required_action: { type: String, trim: true, maxlength: 2000, default: "" },
  reported_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reported_by_name: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["Open", "Under Assessment", "For Adjustment", "Return Visit Required", "Resolved"], default: "Open", index: true },
  return_visit: { date: { type: Date, default: null }, time: { type: String, trim: true, default: "" }, reason: { type: String, trim: true, maxlength: 1000, default: "" } },
  history: { type: [HistorySchema], default: [] },
}, { timestamps: true });

export default mongoose.model("InstallationIssue", InstallationIssueSchema);
