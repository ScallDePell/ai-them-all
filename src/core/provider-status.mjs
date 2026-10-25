import { DEFAULT_ENDPOINTS, KEYED_PROVIDERS, PROVIDERS } from "./constants.mjs";
import { resolveServices } from "./settings-schema.mjs";

/**
 * Tells whether one service (text or image) can run, and if not, which settings
 * the GM has to fill (as i18n keys). Never returns the key itself.
 */
export function describeServiceStatus({ provider, endpoint, apiKey, model } = {}, kind = "text") {
  if (!provider || provider === PROVIDERS.NONE || !(provider in DEFAULT_ENDPOINTS)) {
    return { ready: false, provider: PROVIDERS.NONE, endpoint: null, issues: ["AITHEMALL.Status.NoProvider"] };
  }
  const issues = [];
  if (kind === "image" && provider === PROVIDERS.ANTHROPIC) issues.push("AITHEMALL.Status.NoImageGeneration");
  if (KEYED_PROVIDERS.includes(provider) && !apiKey?.trim()) issues.push("AITHEMALL.Status.MissingApiKey");
  if (!model?.trim()) issues.push(kind === "image" ? "AITHEMALL.Status.MissingImageModel" : "AITHEMALL.Status.MissingTextModel");
  return {
    ready: issues.length === 0,
    provider,
    endpoint: endpoint?.trim() || DEFAULT_ENDPOINTS[provider],
    issues
  };
}

export function describeProviderStatus(settings = {}) {
  const { text, image } = resolveServices(settings);
  return { text: describeServiceStatus(text, "text"), image: describeServiceStatus(image, "image") };
}
