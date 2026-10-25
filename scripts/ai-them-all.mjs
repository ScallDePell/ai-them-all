import { MODULE_ID } from "../src/core/constants.mjs";
import { describeProviderStatus } from "../src/core/provider-status.mjs";
import { registerCardStore } from "../src/foundry/card-store.mjs";
import { integrationState, watchRuleThemAll } from "../src/foundry/rta-bridge.mjs";
import { registerDesignerSettings } from "../src/foundry/rules-panel.mjs";
import { readSettings, registerSettings } from "../src/foundry/settings.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerCardStore();
  registerDesignerSettings();
  watchRuleThemAll();
  game.modules.get(MODULE_ID).api = Object.freeze({
    status: () => describeProviderStatus(readSettings()),
    integration: () => integrationState()
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  const status = describeProviderStatus(readSettings());
  for (const [kind, s] of Object.entries(status)) {
    if (!s.ready) console.info(`AI Them'All | ${kind} service not configured:`, s.issues.map(k => game.i18n.localize(k)).join(" "));
  }
});
