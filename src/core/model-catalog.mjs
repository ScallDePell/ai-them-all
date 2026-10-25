import { DEFAULT_ENDPOINTS, KEYED_PROVIDERS, PROVIDERS } from "./constants.mjs";
import { ConnectionError, requestJson, trimSlash } from "./http.mjs";

export { ConnectionError };

const IMAGE_MODEL = /dall-e|gpt-image|image|flux|stable-diffusion|sdxl/i;
const NOT_GENERATIVE = /embed|whisper|tts|transcribe|moderation|audio|realtime|search/i;

const byLabel = (a, b) => a.label.localeCompare(b.label);

function classify(entries) {
  const text = [], image = [];
  for (const entry of entries) {
    if (IMAGE_MODEL.test(entry.id)) image.push(entry);
    else if (!NOT_GENERATIVE.test(entry.id)) text.push(entry);
  }
  return { text: text.sort(byLabel), image: image.sort(byLabel) };
}

const ADAPTERS = {
  [PROVIDERS.ANTHROPIC]: {
    url: endpoint => `${endpoint}/v1/models?limit=1000`,
    headers: apiKey => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    }),
    // The Anthropic API generates text only.
    parse: body => ({
      text: body.data.map(m => ({ id: m.id, label: m.display_name || m.id })).sort(byLabel),
      image: []
    }),
    valid: body => Array.isArray(body?.data)
  },
  [PROVIDERS.OPENAI]: {
    url: endpoint => `${endpoint}/models`,
    headers: apiKey => ({ Authorization: `Bearer ${apiKey}` }),
    parse: body => classify(body.data.map(m => ({ id: m.id, label: m.id }))),
    valid: body => Array.isArray(body?.data)
  },
  [PROVIDERS.OLLAMA]: {
    url: endpoint => `${endpoint}/api/tags`,
    headers: () => ({}),
    parse: body => classify(body.models.map(m => ({ id: m.name, label: m.name }))),
    valid: body => Array.isArray(body?.models)
  }
};

/**
 * Lists the text and image models the configured service offers. Doubles as the
 * connectivity test: any failure is a ConnectionError with a code for the message.
 */
export async function listModels({ provider, endpoint, apiKey } = {}, fetchImpl = globalThis.fetch) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new ConnectionError("noProvider");
  if (KEYED_PROVIDERS.includes(provider) && !apiKey?.trim()) throw new ConnectionError("missingApiKey");
  const base = trimSlash(endpoint?.trim() || DEFAULT_ENDPOINTS[provider]);
  const body = await requestJson(fetchImpl, adapter.url(base), { headers: adapter.headers(apiKey?.trim()) });
  if (!adapter.valid(body)) throw new ConnectionError("badResponse");
  return adapter.parse(body);
}
