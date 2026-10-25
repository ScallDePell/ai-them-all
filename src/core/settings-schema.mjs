import { PROVIDERS } from "./constants.mjs";

const key = (setting, part) => `AITHEMALL.Settings.${setting}.${part}`;

/**
 * Settings declared by the module, independent of Foundry so they can be tested.
 * The API key is client-scoped on purpose: world settings are readable by every player.
 */
export const SETTINGS = Object.freeze([
  {
    key: "provider",
    scope: "world",
    type: String,
    default: PROVIDERS.NONE,
    choices: Object.fromEntries(Object.values(PROVIDERS).map(p => [p, key("provider", `Choices.${p}`)]))
  },
  { key: "endpoint", scope: "world", type: String, default: "" },
  { key: "textModel", scope: "world", type: String, default: "" },
  { key: "imageModel", scope: "world", type: String, default: "" },
  { key: "apiKey", scope: "client", type: String, default: "" }
].map(s => Object.freeze({ ...s, name: key(s.key, "Name"), hint: key(s.key, "Hint"), config: true })));
