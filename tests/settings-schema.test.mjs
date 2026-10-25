import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS } from "../src/core/settings-schema.mjs";

test("the API key is never a world setting", () => {
  assert.equal(SETTINGS.find(s => s.key === "apiKey").scope, "client");
});

test("the provider defaults to none so the module loads without AI", () => {
  assert.equal(SETTINGS.find(s => s.key === "provider").default, "none");
});

test("every setting has a name and a hint key", () => {
  for (const s of SETTINGS) {
    assert.match(s.name, /^AITHEMALL\.Settings\./);
    assert.match(s.hint, /^AITHEMALL\.Settings\./);
  }
});

test("both API keys are client settings", () => {
  for (const key of ["apiKey", "imageApiKey"]) assert.equal(SETTINGS.find(s => s.key === key).scope, "client");
});

test("Claude is not offered as an image service", () => {
  assert.ok(!("anthropic" in SETTINGS.find(s => s.key === "imageProvider").choices));
});

test("images reuse the text service by default", async () => {
  const { resolveServices } = await import("../src/core/settings-schema.mjs");
  const { image } = resolveServices({ provider: "openai", endpoint: "e", apiKey: "k", imageModel: "m", imageProvider: "ollama" });
  assert.deepEqual(image, { provider: "openai", endpoint: "e", apiKey: "k", model: "m", sameAsText: true });
});
