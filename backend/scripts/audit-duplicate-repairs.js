import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RepairRequest from "../models/RepairRequest.js";
import { buildActiveRepairKey } from "../utils/repairIdentity.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env"), quiet: true });
const dnsServers = (process.env.MONGODB_DNS_SERVERS || "").split(",").map((server) => server.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

const activeStatuses = ["pending_review", "quotation_pending_approval", "customer_accepted", "admin_approved", "scheduled", "in_progress"];
const flagDuplicates = process.argv.includes("--flag");

try {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/reactvite", { serverSelectionTimeoutMS: 8000 });
  const records = await RepairRequest.find({ status: { $in: activeStatuses }, customer: { $ne: null }, order: { $ne: null } })
    .select("_id repairTrackingId customer order productIndex productName status schedule createdAt duplicateReview")
    .sort({ createdAt: 1, _id: 1 }).lean();
  const groups = new Map();
  for (const repair of records) {
    const key = `${repair.customer}:${repair.order}:${repair.productIndex}`;
    groups.set(key, [...(groups.get(key) || []), repair]);
  }
  let duplicateCount = 0;
  let keyedPrimaryCount = 0;
  for (const group of groups.values()) {
    const [primary, ...duplicates] = group;
    if (flagDuplicates) {
      await RepairRequest.updateOne({ _id: primary._id }, { $set: { activeRepairKey: buildActiveRepairKey(primary) } });
      keyedPrimaryCount += 1;
    }
    for (const duplicate of duplicates) {
      duplicateCount += 1;
      console.log(JSON.stringify({ project: String(primary.order), customer: String(primary.customer), productIndex: primary.productIndex, primary: { id: String(primary._id), ticket: primary.repairTrackingId, status: primary.status }, duplicate: { id: String(duplicate._id), ticket: duplicate.repairTrackingId, status: duplicate.status }, alreadyFlagged: Boolean(duplicate.duplicateReview?.flagged), flagged: flagDuplicates }));
      if (flagDuplicates) {
        await RepairRequest.updateOne({ _id: duplicate._id }, { $set: { "duplicateReview.flagged": true, "duplicateReview.duplicateOf": primary._id, "duplicateReview.flaggedAt": new Date() }, $unset: { activeRepairKey: "" } });
      }
    }
  }
  console.log(`Audit complete. ${duplicateCount} duplicate active ticket(s) found${flagDuplicates ? ` and flagged for administrator review; ${keyedPrimaryCount} primary active ticket(s) keyed` : " (dry run; no records changed)"}.`);
} catch (error) {
  console.error(`Repair duplicate audit failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
