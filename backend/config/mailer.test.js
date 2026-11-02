import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { providerAcceptedRecipient } from "../services/extraChargeReceiptSending.js";
import { sendMail } from "./mailer.js";

const providerEnvKeys = [
  "NODE_ENV",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_SMTP_LOGIN",
  "BREVO_SMTP_USER",
  "BREVO_SMTP_KEY",
  "BREVO_SMTP_PASSWORD",
  "BREVO_SMTP_HOST",
  "BREVO_SMTP_PORT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
];

const savedEnv = Object.fromEntries(providerEnvKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

const clearProviderEnv = () => providerEnvKeys.forEach((key) => delete process.env[key]);
const restoreProviderEnv = () => {
  clearProviderEnv();
  Object.entries(savedEnv).forEach(([key, value]) => {
    if (value !== undefined) process.env[key] = value;
  });
  globalThis.fetch = originalFetch;
};

afterEach(restoreProviderEnv);

test("customer receipt sends require a configured provider instead of silently using the development inbox", async () => {
  clearProviderEnv();
  process.env.NODE_ENV = "development";

  await assert.rejects(
    sendMail({ to: "customer@example.test", subject: "Receipt", text: "Receipt" }, { requireConfiguredProvider: true }),
    /A real email provider is required/,
  );
});

test("a mocked Brevo acceptance is returned as provider acceptance for the requested recipient", async () => {
  clearProviderEnv();
  process.env.NODE_ENV = "test";
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.BREVO_SENDER_EMAIL = "billing@example.test";
  let requestPayload;
  globalThis.fetch = async (_url, options) => {
    requestPayload = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ messageId: "<provider-test-message>" }),
    };
  };

  const result = await sendMail({
    to: "customer@example.test",
    subject: "Extra charge receipt",
    text: "Your receipt is attached.",
    attachments: [{ filename: "receipt.pdf", content: Buffer.from("%PDF-test"), contentType: "application/pdf" }],
  }, { requireConfiguredProvider: true });

  assert.equal(result.provider, "brevo");
  assert.equal(providerAcceptedRecipient(result, "customer@example.test"), true);
  assert.deepEqual(requestPayload.to, [{ email: "customer@example.test", name: "ACGC Services" }]);
  assert.equal(requestPayload.attachment[0].name, "receipt.pdf");
  assert.equal(requestPayload.attachment[0].content, Buffer.from("%PDF-test").toString("base64"));
});

test("a provider rejection remains a failure and does not fall back to the development inbox", async () => {
  clearProviderEnv();
  process.env.NODE_ENV = "development";
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.BREVO_SENDER_EMAIL = "billing@example.test";
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "Test provider rejection" }),
    };
  };

  await assert.rejects(
    sendMail({ to: "customer@example.test", subject: "Receipt", text: "Receipt" }, { requireConfiguredProvider: true }),
    /Test provider rejection/,
  );
  assert.equal(requestCount, 1);
});
