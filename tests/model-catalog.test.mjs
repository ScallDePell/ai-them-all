import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectionError, listModels } from "../src/core/model-catalog.mjs";

const reply = (body, status = 200) => async (url, init) => {
  reply.last = { url, init };
  return { ok: status < 400, status, json: async () => body };
};

test("Claude lists text models with their display names and no image model", async () => {
  const fetch = reply({ data: [{ id: "claude-b", display_name: "Claude B" }, { id: "claude-a", display_name: "Claude A" }] });
  const models = await listModels({ provider: "anthropic", apiKey: "k" }, fetch);
  assert.deepEqual(models.text.map(m => m.id), ["claude-a", "claude-b"]);
  assert.deepEqual(models.image, []);
  assert.equal(reply.last.url, "https://api.anthropic.com/v1/models?limit=1000");
  assert.equal(reply.last.init.headers["x-api-key"], "k");
});

test("OpenAI-compatible models are split into text and image", async () => {
  const fetch = reply({ data: [{ id: "gpt-4o" }, { id: "gpt-image-1" }, { id: "dall-e-3" }, { id: "text-embedding-3-small" }] });
  const models = await listModels({ provider: "openai", apiKey: "k", endpoint: "https://proxy.local/v1/" }, fetch);
  assert.deepEqual(models.text.map(m => m.id), ["gpt-4o"]);
  assert.deepEqual(models.image.map(m => m.id), ["dall-e-3", "gpt-image-1"]);
  assert.equal(reply.last.url, "https://proxy.local/v1/models");
  assert.equal(reply.last.init.headers.Authorization, "Bearer k");
});

test("Ollama needs no key and reads its local tags", async () => {
  const fetch = reply({ models: [{ name: "llama3:8b" }, { name: "nomic-embed-text" }] });
  const models = await listModels({ provider: "ollama" }, fetch);
  assert.deepEqual(models.text.map(m => m.id), ["llama3:8b"]);
  assert.equal(reply.last.url, "http://localhost:11434/api/tags");
});

const rejects = (promise, code) => assert.rejects(promise, e => e instanceof ConnectionError && e.code === code);

test("errors carry a code for the message shown to the GM", async () => {
  await rejects(listModels({ provider: "none" }), "noProvider");
  await rejects(listModels({ provider: "anthropic" }), "missingApiKey");
  await rejects(listModels({ provider: "openai", apiKey: "k" }, reply({}, 401)), "auth");
  await rejects(listModels({ provider: "openai", apiKey: "k" }, reply({}, 500)), "http");
  await rejects(listModels({ provider: "openai", apiKey: "k" }, reply({ nope: true })), "badResponse");
  await rejects(listModels({ provider: "ollama" }, async () => { throw new TypeError("Failed to fetch"); }), "network");
});
