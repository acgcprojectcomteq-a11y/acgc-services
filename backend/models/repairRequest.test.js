import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import RepairRequest from "./RepairRequest.js";
import { ACTIVE_REPAIR_STATUSES, buildActiveRepairKey } from "../utils/repairIdentity.js";

const customer = new mongoose.Types.ObjectId();
const order = new mongoose.Types.ObjectId();

test("every active repair status receives a project item uniqueness key", async () => {
  for (const status of ACTIVE_REPAIR_STATUSES) {
    const repair = new RepairRequest({ customer, order, productIndex: 0, customerName: "Customer", productName: "Window", issueDescription: "Repair", workflowType: "paid", status });
    await repair.validate();
    assert.equal(repair.activeRepairKey, `${customer}:${order}:0`, status);
  }
});

test("terminal statuses release the active project item key", async () => {
  for (const status of ["completed", "cancelled", "rejected"]) {
    const repair = new RepairRequest({ customer, order, productIndex: 0, customerName: "Customer", productName: "Window", issueDescription: "Repair", workflowType: "paid", status });
    await repair.validate();
    assert.equal(repair.activeRepairKey, undefined, status);
  }
});

test("different projects, customers, and product rows have different keys", () => {
  const otherCustomer = new mongoose.Types.ObjectId();
  const otherOrder = new mongoose.Types.ObjectId();
  const base = { customer, order, productIndex: 0, status: "scheduled" };
  const key = buildActiveRepairKey(base);
  assert.notEqual(buildActiveRepairKey({ ...base, productIndex: 1 }), key);
  assert.notEqual(buildActiveRepairKey({ ...base, order: otherOrder }), key);
  assert.notEqual(buildActiveRepairKey({ ...base, customer: otherCustomer }), key);
});

test("active repair identity has a sparse unique database index", () => {
  const index = RepairRequest.schema.indexes().find(([fields, options]) => fields.activeRepairKey === 1 && options.name === "unique_active_repair_per_project_item");
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.equal(index[1].sparse, true);
});
