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
