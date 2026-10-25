import { RTA_REGISTER_HOOK } from "../core/constants.mjs";
import { negotiateIntegration } from "../core/rta-negotiation.mjs";

let state = { mode: "standalone", reason: "absent" };

export function integrationState() {
  return state;
}

function connect(integrations) {
  if (!integrations || state.mode === "integrated") return;
  state = negotiateIntegration(integrations);
  if (state.mode === "standalone") {
    console.warn(`AI Them'All | Rule Them'All integration unavailable (${state.reason}), staying standalone`, state);
  }
}

/** Works whatever the module load order: RTA's setup hook, then a ready fallback. */
export function watchRuleThemAll() {
  Hooks.on(RTA_REGISTER_HOOK, connect);
  Hooks.once("ready", () => connect(game.ruleThemAll?.integrations));
}
