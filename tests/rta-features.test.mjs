import { test } from "node:test";
import assert from "node:assert/strict";

// Just enough Foundry for the windows' classes to be declared.
const store = { cards: [] };
globalThis.foundry = { utils: { randomID: () => "id" }, applications: { api: { ApplicationV2: class { render() { return this; } } } } };
globalThis.game = { i18n: { localize: k => k, format: k => k }, settings: { get: (m, k) => store[k], set: async (m, k, v) => { store[k] = v; } } };
const { registerRtaFeatures } = await import("../src/foundry/rta-features.mjs");

const fakeRegistry = () => {
  const got = {};
  return {
    got,
    registerConfiguratorSection: d => { got.section = d; },
    registerSheetFieldAction: d => { got.action = d; },
    registerAssistantPanel: d => { got.panel = d; }
  };
};
const ALL = ["assistantPanels", "configuratorSections", "cardHost", "sheetFields", "fieldSources", "fieldTargets", "sheetFieldActions", "rulesetChanges"];

test("with every capability, the three contributions are registered in their places", () => {
  const registry = fakeRegistry();
  assert.deepEqual(registerRtaFeatures(registry, ALL), ["configuratorSection", "sheetFieldAction", "assistantPanel"]);
  assert.equal(registry.got.section.parentGroup, "systems");
  assert.equal(registry.got.section.after, "sheetDefinitions");
  assert.equal(typeof registry.got.section.cards.list, "function");
  assert.equal(registry.got.action.ownerModule, "ai-them-all");
  assert.equal(typeof registry.got.panel.render, "function");
});

test("a missing capability leaves its contribution out", () => {
  const registry = fakeRegistry();
  assert.deepEqual(registerRtaFeatures(registry, ["configuratorSections", "cardHost"]), ["configuratorSection"]);
  assert.equal(registry.got.action, undefined);
  assert.equal(registry.got.panel, undefined);
});

test("only the GM gets the field button and the designer, players never", () => {
  const registry = fakeRegistry();
  registerRtaFeatures(registry, ALL);
  assert.equal(registry.got.action.isVisible({ user: { isGM: false } }), false);
  assert.equal(registry.got.action.isVisible({ user: { isGM: true }, editable: true }), true);
  assert.equal(registry.got.panel.isVisible({ user: { isGM: false } }), false);
  assert.equal(registry.got.section.cards.canMutate({ user: { isGM: false } }), false);
});
