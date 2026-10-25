import { MODULE_ID } from "../src/core/constants.mjs";
import { describeProviderStatus } from "../src/core/provider-status.mjs";
import { integrationState, watchRuleThemAll } from "../src/foundry/rta-bridge.mjs";
import { readSettings, registerSettings } from "../src/foundry/settings.mjs";

Hooks.once("init", () => {
  registerSettings();
  watchRuleThemAll();
  game.modules.get(MODULE_ID).api = Object.freeze({
    status: () => describeProviderStatus(readSettings()),
    integration: () => integrationState()
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  const status = describeProviderStatus(readSettings());
  if (!status.ready) console.info("AI Them'All | AI not configured:", status.issues.map(k => game.i18n.localize(k)).join(" "));
});
