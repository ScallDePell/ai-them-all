import { DEFAULT_ENDPOINTS, KEYED_PROVIDERS, PROVIDERS } from "./constants.mjs";
import { ConnectionError, requestJson, trimSlash } from "./http.mjs";

function serviceBase({ provider, endpoint, apiKey, model }) {
  if (!(provider in DEFAULT_ENDPOINTS)) throw new ConnectionError("noProvider");
  if (KEYED_PROVIDERS.includes(provider) && !apiKey?.trim()) throw new ConnectionError("missingApiKey");
  if (!model?.trim()) throw new ConnectionError("noModel");
  return { base: trimSlash(endpoint?.trim() || DEFAULT_ENDPOINTS[provider]), key: apiKey?.trim(), model: model.trim() };
}

const TEXT = {
  [PROVIDERS.ANTHROPIC]: {
    path: "/v1/messages",
    headers: key => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }),
    body: (model, { system, prompt, maxTokens }) => ({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
    read: body => Array.isArray(body?.content) ? body.content.filter(part => part.type === "text").map(part => part.text).join("") : null
  },
  [PROVIDERS.OPENAI]: {
    path: "/chat/completions",
    headers: key => ({ Authorization: `Bearer ${key}` }),
    body: (model, { system, prompt, maxTokens }) => ({ model, max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    read: body => body?.choices?.[0]?.message?.content ?? null
  },
  [PROVIDERS.OLLAMA]: {
    path: "/api/chat",
    headers: () => ({}),
    // Ollama's default context is short and cuts long requests (the rules designer's catalog) silently.
    body: (model, { system, prompt, maxTokens }) => ({ model, stream: false, options: { num_ctx: 32768, num_predict: maxTokens },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    read: body => body?.message?.content ?? null
  }
};

/** One text answer from the text service. */
export async function generateText(service, { system = "", prompt, maxTokens = 1024 }, fetchImpl = globalThis.fetch) {
  const { base, key, model } = serviceBase(service);
  const adapter = TEXT[service.provider];
  const body = await requestJson(fetchImpl, `${base}${adapter.path}`, {
    method: "POST", headers: adapter.headers(key), body: adapter.body(model, { system, prompt, maxTokens })
  });
  const text = adapter.read(body);
  if (typeof text !== "string") throw new ConnectionError("badResponse");
  return text.trim();
}

/**
 * Images from an OpenAI-compatible service, one call per variant (some models make one image per call).
 * Each image is { b64 } or { url }.
 */
export async function generateImages(service, { prompt, count = 1, size = "1024x1024" }, fetchImpl = globalThis.fetch) {
  if (service.provider !== PROVIDERS.OPENAI) throw new ConnectionError("noImageGeneration");
  const { base, key, model } = serviceBase(service);
  const images = [];
  for (let i = 0; i < Math.max(1, Math.min(count, 4)); i++) {
    const body = await requestJson(fetchImpl, `${base}/images/generations`, {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: { model, prompt, n: 1, size }
    });
    const image = body?.data?.[0];
    if (image?.b64_json) images.push({ b64: image.b64_json });
    else if (image?.url) images.push({ url: image.url });
    else throw new ConnectionError("badResponse");
  }
  return images;
}
