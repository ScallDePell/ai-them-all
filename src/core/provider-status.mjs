import { DEFAULT_ENDPOINTS, KEYED_PROVIDERS, PROVIDERS } from "./constants.mjs";

/**
 * Tells whether text generation can run with the given settings, and if not, which
 * settings the GM has to fill (as i18n keys). Never returns the key itself.
 */
export function describeProviderStatus({ provider, endpoint, textModel, apiKey } = {}) {
  if (!provider || provider === PROVIDERS.NONE || !(provider in DEFAULT_ENDPOINTS)) {
    return { ready: false, provider: PROVIDERS.NONE, endpoint: null, issues: ["AITHEMALL.Status.NoProvider"] };
  }
  const issues = [];
  if (KEYED_PROVIDERS.includes(provider) && !apiKey?.trim()) issues.push("AITHEMALL.Status.MissingApiKey");
  if (!textModel?.trim()) issues.push("AITHEMALL.Status.MissingTextModel");
  return {
    ready: issues.length === 0,
    provider,
    endpoint: endpoint?.trim() || DEFAULT_ENDPOINTS[provider],
    issues
  };
}
