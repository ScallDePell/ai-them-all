import { test } from "node:test";
import assert from "node:assert/strict";
import { generateImages, generateText } from "../src/core/generation.mjs";

const recorder = body => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => body }; };
  return { calls, fetch };
};

test("Claude: messages API with the system prompt apart", async () => {
  const { calls, fetch } = recorder({ content: [{ type: "text", text: " Une épée ancienne. " }] });
  const text = await generateText({ provider: "anthropic", apiKey: "k", model: "claude-x" }, { system: "S", prompt: "P" }, fetch);
  assert.equal(text, "Une épée ancienne.");
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].body.system, "S");
  assert.deepEqual(calls[0].body.messages, [{ role: "user", content: "P" }]);
});

test("OpenAI-compatible: chat completions", async () => {
  const { calls, fetch } = recorder({ choices: [{ message: { content: "Texte" } }] });
  assert.equal(await generateText({ provider: "openai", apiKey: "k", model: "gpt" }, { system: "S", prompt: "P" }, fetch), "Texte");
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[0].body.messages[0].role, "system");
});

test("Ollama: chat without streaming", async () => {
  const { calls, fetch } = recorder({ message: { content: "Local" } });
  assert.equal(await generateText({ provider: "ollama", model: "llama3" }, { prompt: "P" }, fetch), "Local");
  assert.equal(calls[0].url, "http://localhost:11434/api/chat");
  assert.equal(calls[0].body.stream, false);
});

test("a missing model is refused before any call", async () => {
  await assert.rejects(generateText({ provider: "ollama" }, { prompt: "P" }, async () => assert.fail()), { code: "noModel" });
});

test("images: one call per variant, base64 or address", async () => {
  const { calls, fetch } = recorder({ data: [{ b64_json: "AAA" }] });
  const images = await generateImages({ provider: "openai", apiKey: "k", model: "gpt-image-1" }, { prompt: "P", count: 3 }, fetch);
  assert.deepEqual(images, [{ b64: "AAA" }, { b64: "AAA" }, { b64: "AAA" }]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/generations");
});

test("images are refused for a service that cannot make them", async () => {
  await assert.rejects(generateImages({ provider: "ollama", model: "x" }, { prompt: "P" }), { code: "noImageGeneration" });
});
