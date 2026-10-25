import { PROVIDERS } from "./constants.mjs";

const key = (setting, part) => `AITHEMALL.Settings.${setting}.${part}`;
const choices = providers => Object.fromEntries(providers.map(p => [p, key("provider", `Choices.${p}`)]));

/** The Anthropic API generates text only, so it is not offered for images. */
export const IMAGE_PROVIDERS = Object.freeze(Object.values(PROVIDERS).filter(p => p !== PROVIDERS.ANTHROPIC));

/**
 * Settings declared by the module, independent of Foundry so they can be tested.
 * API keys are client-scoped on purpose: world settings are readable by every player.
 * All of them are edited in the provider window rather than the native settings list.
 */
export const SETTINGS = Object.freeze([
  { key: "provider", scope: "world", type: String, default: PROVIDERS.NONE, choices: choices(Object.values(PROVIDERS)) },
  { key: "endpoint", scope: "world", type: String, default: "" },
  { key: "apiKey", scope: "client", type: String, default: "" },
  { key: "textModel", scope: "world", type: String, default: "" },
  { key: "imageSameAsText", scope: "world", type: Boolean, default: true },
  { key: "imageProvider", scope: "world", type: String, default: PROVIDERS.NONE, choices: choices(IMAGE_PROVIDERS) },
  { key: "imageEndpoint", scope: "world", type: String, default: "" },
  { key: "imageApiKey", scope: "client", type: String, default: "" },
  { key: "imageModel", scope: "world", type: String, default: "" }
].map(s => Object.freeze({ ...s, name: key(s.key, "Name"), hint: key(s.key, "Hint"), config: false })));

/** Splits the flat settings into the text service and the image service actually used. */
export function resolveServices(settings = {}) {
  const text = { provider: settings.provider, endpoint: settings.endpoint, apiKey: settings.apiKey, model: settings.textModel };
  const base = settings.imageSameAsText !== false
    ? text
    : { provider: settings.imageProvider, endpoint: settings.imageEndpoint, apiKey: settings.imageApiKey };
  return {
    text,
    image: { provider: base.provider, endpoint: base.endpoint, apiKey: base.apiKey, model: settings.imageModel, sameAsText: settings.imageSameAsText !== false }
  };
}
