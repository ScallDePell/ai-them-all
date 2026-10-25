import { test } from "node:test";
import assert from "node:assert/strict";
import { designRule, parseJsonAnswer } from "../src/core/rules-designer.mjs";

const catalog = {
  answerFormats: { integer: "A whole number." },
  paths: [{ id: "burst", group: "combat", title: "Rafale", summary: "Tirs multiples", limits: "", keywords: ["rafale"], questions: [] }]
};
const scripted = replies => {
  const prompts = [];
  return { prompts, generate: async prompt => { prompts.push(prompt); return replies.shift(); } };
};

test("JSON is read inside a fence or surrounded by words", () => {
  assert.deepEqual(parseJsonAnswer('Voici :\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonAnswer('ok {"a": {"b": 2}} fin'), { a: { b: 2 } });
  assert.equal(parseJsonAnswer("rien"), null);
});

test("a valid first answer is planned and nothing is applied here", async () => {
  const { generate } = scripted(['{"pathId": "burst"}', '{"answers": {"rounds": 3}, "explanation": "Crée la rafale."}']);
  const result = await designRule({ description: "Rafale de 3", catalog, generate, describePath: async () => ({ id: "burst" }), plan: async () => ({ valid: true, created: [] }) });
  assert.equal(result.status, "planned");
  assert.deepEqual(result.answers, { rounds: 3 });
  assert.equal(result.explanation, "Crée la rafale.");
});

test("a refused plan goes back with its errors, two retries at most", async () => {
  const { prompts, generate } = scripted(['{"pathId": "burst"}', '{"answers": {"rounds": "x"}}', '{"answers": {"rounds": "y"}}', '{"answers": {"rounds": "z"}}']);
  let plans = 0;
  const result = await designRule({
    description: "Rafale", catalog, generate, describePath: async () => ({}),
    plan: async () => { plans++; return { valid: false, errors: [{ path: "rounds", code: "TYPE", detail: "integer" }] }; }
  });
  assert.equal(plans, 3);
  assert.equal(result.status, "invalid");
  assert.match(prompts[2].prompt, /TYPE/);
});

test("an unknown path or an explicit none is reported, a question is passed on", async () => {
  const none = await designRule({ description: "x", catalog, generate: scripted(['{"none": "Pas de parcours de repos."}']).generate, describePath: async () => ({}), plan: async () => ({}) });
  assert.deepEqual(none, { status: "noPath", reason: "Pas de parcours de repos." });
  const unknown = await designRule({ description: "x", catalog, generate: scripted(['{"pathId": "nope"}']).generate, describePath: async () => ({}), plan: async () => ({}) });
  assert.equal(unknown.status, "noPath");
  const question = await designRule({ description: "x", catalog, generate: scripted(['{"pathId": "burst"}', '{"question": "Combien de balles ?"}']).generate, describePath: async () => ({}), plan: async () => ({}) });
  assert.deepEqual(question, { status: "question", question: "Combien de balles ?" });
});
