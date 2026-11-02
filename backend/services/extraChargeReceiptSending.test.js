import test from "node:test";
import assert from "node:assert/strict";
import { getVerifiedExtraChargeReceiptBalance, providerAcceptedRecipient } from "./extraChargeReceiptSending.js";

const baseOrder = {
  total_amount: 1000,
  contract_amount: 1000,
  amount_paid: 1000,
  payment_ledger_initialized: true,
  payment_records: [],
  legacy_verified_amount: 1000,
  installation_extra_charge_total: 0,
  installation_extra_charge_paid_total: 0,
};

test("receipt release blocks when original contract payments leave a balance", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    amount_paid: 900,
    legacy_verified_amount: 900,
  });
  assert.equal(result.total_project_charges, 1000);
  assert.equal(result.total_verified_payments, 900);
  assert.equal(result.remaining_balance, 100);
  assert.equal(result.fully_paid, false);
});

test("receipt release blocks when any approved extra charge is unpaid", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    installation_extra_charge_total: 300,
  }, [{ total: 300, payments: [] }]);
  assert.equal(result.total_project_charges, 1300);
  assert.equal(result.remaining_balance, 300);
  assert.equal(result.fully_paid, false);
});

test("only verified original and extra charge payments qualify for release", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    payment_records: [
      { status: "verified", verified_amount: 250 },
      { status: "pending", submitted_amount: 750, verified_amount: 0 },
    ],
    legacy_verified_amount: 0,
    amount_paid: 1000,
    installation_extra_charge_total: 300,
    installation_extra_charge_paid_total: 300,
  }, [{ total: 300, payments: [
    { status: "verified", amount: 300 },
    { status: "pending", amount: 500 },
    { status: "rejected", amount: 500 },
  ] }]);
  assert.equal(result.total_project_charges, 1300);
  assert.equal(result.total_verified_payments, 550);
  assert.equal(result.remaining_balance, 750);
  assert.equal(result.fully_paid, false);
  assert.equal(result.has_unverified_payments, true);
});

test("a pending customer proof blocks release even when other verified funds cover the balance", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    payment_records: [],
    legacy_verified_amount: 1000,
    payment_proof_submitted_at: "2026-11-03T00:00:00.000Z",
    payment_proof_confirmed_at: null,
    payment_proof_amount: 500,
  });
  assert.equal(result.remaining_balance, 0);
  assert.equal(result.has_unverified_payments, true);
  assert.equal(result.fully_paid, false);
});

test("all verified project payments and approved charges yield zero balance", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    payment_records: [{ status: "verified", verified_amount: 1000 }],
    legacy_verified_amount: 0,
    installation_extra_charge_total: 300,
    installation_extra_charge_paid_total: 300,
  }, [{ total: 300, payments: [{ status: "verified", amount: 300 }] }]);
  assert.equal(result.total_project_charges, 1300);
  assert.equal(result.total_verified_payments, 1300);
  assert.equal(result.remaining_balance, 0);
  assert.equal(result.fully_paid, true);
});

test("a fully paid original contract is receipt eligible when no extra charges exist", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    total_amount: 9400,
    contract_amount: 9400,
    payment_records: [{ status: "verified", verified_amount: 9400 }],
    legacy_verified_amount: 0,
  });

  assert.equal(result.original_total, 9400);
  assert.equal(result.approved_extra_charges, 0);
  assert.equal(result.total_project_charges, 9400);
  assert.equal(result.total_verified_payments, 9400);
  assert.equal(result.remaining_balance, 0);
  assert.equal(result.fully_paid, true);
});

test("a verified transaction that covers the original project and its added charge unlocks receipt sending", () => {
  const result = getVerifiedExtraChargeReceiptBalance({
    ...baseOrder,
    total_amount: 9400,
    contract_amount: 9400,
    amount_paid: 9700,
    legacy_verified_amount: 0,
    payment_records: [{ status: "verified", verified_amount: 9700 }],
    installation_extra_charge_total: 300,
  }, [{ total: 300, payments: [] }]);

  assert.equal(result.original_total, 9400);
  assert.equal(result.total_project_charges, 9700);
  assert.equal(result.total_verified_payments, 9700);
  assert.equal(result.remaining_balance, 0);
  assert.equal(result.fully_paid, true);
});

test("provider acceptance must match the registered recipient", () => {
  assert.equal(providerAcceptedRecipient({ accepted: ["customer@example.com"] }, "customer@example.com"), true);
  assert.equal(providerAcceptedRecipient({ accepted: ["other@example.com"] }, "customer@example.com"), false);
  assert.equal(providerAcceptedRecipient({ accepted: ["customer@example.com"], rejected: ["customer@example.com"] }, "customer@example.com"), false);
  assert.equal(providerAcceptedRecipient({ provider: "brevo", messageId: "<accepted-id>" }, "customer@example.com"), true);
  assert.equal(providerAcceptedRecipient({ provider: "brevo" }, "customer@example.com"), false);
});
