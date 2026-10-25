import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProviderStatus, describeServiceStatus } from "../src/core/provider-status.mjs";

test("no provider is not ready and says what to set", () => {
  const status = describeServiceStatus({ provider: "none" });
  assert.equal(status.ready, false);
  assert.deepEqual(status.issues, ["AITHEMALL.Status.NoProvider"]);
});

test("an unknown provider is treated as none", () => {
  assert.equal(describeServiceStatus({ provider: "mystery" }).provider, "none");
});

test("Claude needs a key and a model", () => {
  const status = describeServiceStatus({ provider: "anthropic" });
  assert.deepEqual(status.issues, ["AITHEMALL.Status.MissingApiKey", "AITHEMALL.Status.MissingTextModel"]);
});

test("Ollama works without a key and uses the local default endpoint", () => {
  const status = describeServiceStatus({ provider: "ollama", model: "llama3", endpoint: " " });
  assert.equal(status.ready, true);
  assert.equal(status.endpoint, "http://localhost:11434");
});

test("the status never contains the API key", () => {
  const status = describeProviderStatus({ provider: "openai", textModel: "m", apiKey: "sk-secret", imageModel: "i" });
  assert.equal(status.text.ready, true);
  assert.equal(status.image.ready, true);
  assert.ok(!JSON.stringify(status).includes("sk-secret"));
});

test("images can use their own service", () => {
  const status = describeProviderStatus({
    provider: "anthropic", apiKey: "k", textModel: "claude",
    imageSameAsText: false, imageProvider: "openai", imageApiKey: "k2", imageModel: "gpt-image-1"
  });
  assert.equal(status.text.provider, "anthropic");
  assert.equal(status.image.provider, "openai");
  assert.equal(status.image.ready, true);
});

test("Claude as the shared service cannot make images", () => {
  const status = describeProviderStatus({ provider: "anthropic", apiKey: "k", textModel: "claude", imageModel: "x" });
  assert.equal(status.text.ready, true);
  assert.deepEqual(status.image.issues, ["AITHEMALL.Status.NoImageGeneration"]);
});
