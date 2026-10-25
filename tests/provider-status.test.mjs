import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProviderStatus } from "../src/core/provider-status.mjs";

test("no provider is not ready and says what to set", () => {
  const status = describeProviderStatus({ provider: "none" });
  assert.equal(status.ready, false);
  assert.deepEqual(status.issues, ["AITHEMALL.Status.NoProvider"]);
});

test("an unknown provider is treated as none", () => {
  assert.equal(describeProviderStatus({ provider: "mystery" }).provider, "none");
});

test("Claude needs a key and a model", () => {
  const status = describeProviderStatus({ provider: "anthropic" });
  assert.deepEqual(status.issues, ["AITHEMALL.Status.MissingApiKey", "AITHEMALL.Status.MissingTextModel"]);
});

test("Ollama works without a key and uses the local default endpoint", () => {
  const status = describeProviderStatus({ provider: "ollama", textModel: "llama3", endpoint: " " });
  assert.equal(status.ready, true);
  assert.equal(status.endpoint, "http://localhost:11434");
});

test("the status never contains the API key", () => {
  const status = describeProviderStatus({ provider: "openai", textModel: "m", apiKey: "sk-secret" });
  assert.equal(status.ready, true);
  assert.ok(!JSON.stringify(status).includes("sk-secret"));
});
