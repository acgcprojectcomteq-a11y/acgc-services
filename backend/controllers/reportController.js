import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import {
  createTransactionReportWorkbookBuffer,
  TRANSACTION_REPORT_CATEGORIES,
  validateTransactionReportFilters,
} from "../services/transactionWorkbook.js";

const reportFields = [
  "customer customer_name customer_email customer_phone tracking order_type",
  "contract_status contractStatus acceptance_method acceptanceMethod acceptedByCustomer signed_contract_url contract_signed_date",
  "status progress transactionCreatedAt acceptedAt createdAt updatedAt",
  "items review",
  "payment_terms final_project_cost contract_amount total_amount manual_override",
  "required_downpayment_amount downpayment_amount payment_ledger_initialized legacy_verified_amount installation_extra_charge_total installation_extra_charge_paid_total",
  "amount_paid payment_amount paid_amount payment_records payment_status payment_method transaction_number",
  "payment_proof_confirmed_at warranty_assignment_mode warranty_period custom_warranty_days",
  "warranty_start_date warranty_expiry_date warranty_status warranty_terms",
].join(" ");

const transactionDateFields = ["transactionCreatedAt", "acceptedAt", "createdAt"];
const reportDateFields = {
  customer_feedback: ["review.submittedAt", "review.updatedAt", "items.review.submittedAt", "items.review.updatedAt"],
  payment_records: [
    "payment_records.payment_date", "payment_records.verified_at", "payment_records.recorded_at",
    "payment_records.submitted_at", "payment_records.createdAt", "payment_proof_confirmed_at", "updatedAt",
    ...transactionDateFields,
  ],
  warranty_records: [
    "warranty_start_date", "warranty_expiry_date", "items.warranty_start_date", "items.warranty_expiry_date",
    "updatedAt", ...transactionDateFields,
  ],
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildReportDateQuery = (filters) => {
  if (!filters.startDate && !filters.endDate && !filters.startAt && !filters.endAt) return null;
  const range = {};
  if (filters.startAt) range.$gte = filters.startAt;
  else if (filters.startDate) range.$gte = new Date(`${filters.startDate}T00:00:00.000Z`);
  if (filters.endAt) range.$lte = filters.endAt;
  else if (filters.endDate) range.$lte = new Date(`${filters.endDate}T23:59:59.999Z`);

  const fields = filters.type === "all_reports"
    ? [...new Set([
        ...transactionDateFields,
        ...reportDateFields.customer_feedback,
        ...reportDateFields.payment_records,
        ...reportDateFields.warranty_records,
      ])]
    : reportDateFields[filters.type] || transactionDateFields;
  return { $or: fields.map((field) => ({ [field]: range })) };
};

const findMatchingCustomerIds = async (search) => {
  const expression = new RegExp(escapeRegex(search), "i");
  const nameParts = String(search).trim().split(/\s+/).filter(Boolean);
  const nameMatches = nameParts.length > 1
    ? [
        { first_name: new RegExp(escapeRegex(nameParts[0]), "i"), last_name: new RegExp(escapeRegex(nameParts.slice(1).join(" ")), "i") },
        { first_name: new RegExp(escapeRegex(nameParts[nameParts.length - 1]), "i"), last_name: new RegExp(escapeRegex(nameParts.slice(0, -1).join(" ")), "i") },
      ]
    : [{ first_name: expression }, { last_name: expression }];
  const users = await User.find({
    $or: [...nameMatches, { email: expression }],
  }).select("_id").lean();
  return users.map((user) => user._id);
};

export const buildReportOrderQuery = async (filters, resolveCustomerIds = findMatchingCustomerIds) => {
  const clauses = [{
    $or: [
      { contract_status: /^accepted$/i },
      { contractStatus: /^accepted$/i },
      {
        $and: [
          { $or: [{ contract_status: null }, { contract_status: "" }] },
          { $or: [
            { acceptedByCustomer: true },
            { status: { $in: ["contract_accepted", "approved", "processing", "completed"] } },
          ] },
        ],
      },
    ],
  }];
  const dateQuery = buildReportDateQuery(filters);
  if (dateQuery) clauses.push(dateQuery);

  if (filters.customer !== "all") {
    if (filters.customer.startsWith("name:")) {
      const name = filters.customer.slice(5).trim();
      const matchingUsers = await resolveCustomerIds(name);
      const exactName = new RegExp(`^${escapeRegex(name)}$`, "i");
      clauses.push({ $or: [
        { customer_name: exactName },
        ...(matchingUsers.length ? [{ customer: { $in: matchingUsers } }] : []),
      ] });
    } else {
      clauses.push({ customer: new mongoose.Types.ObjectId(filters.customer) });
    }
  }

  if (filters.search) {
    const expression = new RegExp(escapeRegex(filters.search), "i");
    const searchableFields = [
      "tracking", "customer_name", "customer_email", "transaction_number",
      "items.name", "items.product_name", "payment_records.transaction_number",
      "review.title", "review.comment", "review.tags",
      "items.review.title", "items.review.comment", "items.review.tags",
    ];
    const searchMatches = searchableFields.map((field) => ({ [field]: expression }));
    if (mongoose.Types.ObjectId.isValid(filters.search)) {
      searchMatches.push({ _id: new mongoose.Types.ObjectId(filters.search) });
    }
    const matchingUsers = await resolveCustomerIds(filters.search);
    if (matchingUsers.length) searchMatches.push({ customer: { $in: matchingUsers } });
    clauses.push({ $or: searchMatches });
  }

  return { $and: clauses };
};

export const generateTransactionReport = async (req, res) => {
  try {
    if (!req.user || !["admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Admin access required to generate transaction reports." });
    }

    const filters = validateTransactionReportFilters(req.query || {});
    const orderQuery = await buildReportOrderQuery(filters);
    const orders = await Order.find(orderQuery)
      .select(reportFields)
      .populate("customer", "first_name last_name email phone")
      .lean();
    const workbookBuffer = await createTransactionReportWorkbookBuffer(orders, filters);
    const reportName = filters.type === "all_reports"
      ? "All_Reports"
      : TRANSACTION_REPORT_CATEGORIES.find((category) => category.value === filters.type)?.label.replace(/\s+/g, "_") || "Transactions";
    const generatedAt = new Date();
    const localDate = [generatedAt.getFullYear(), generatedAt.getMonth() + 1, generatedAt.getDate()]
      .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, "0"))
      .join("-");
    const filename = `ACGC_${reportName}_${localDate}.xlsx`;

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": workbookBuffer.length,
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "Content-Disposition",
    });
    return res.status(200).send(workbookBuffer);
  } catch (error) {
    console.error("Generate transaction report error:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Unable to generate transaction report.",
    });
  }
};
