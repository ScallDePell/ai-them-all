import { test } from "node:test";
import assert from "node:assert/strict";
import { fillStep, parseJsonAnswer, planSteps } from "../src/core/rules-designer.mjs";

const catalog = {
  answerFormats: { integer: "A whole number." },
  paths: [
    { id: "value", group: "bricks", title: "Valeur", summary: "Une valeur", limits: "", keywords: [], questions: [] },
    { id: "test", group: "rolls", title: "Test", summary: "Un test", limits: "", keywords: [], questions: [] }
  ]
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

test("a missing entry becomes a step before the one that uses it", async () => {
  const { prompts, generate } = scripted([JSON.stringify({ steps: [
    { pathId: "value", goal: "Créer la définition Hauteur du socle Humain" },
    { pathId: "test", goal: "Test de saut en hauteur" },
    { pathId: "unknown", goal: "ignorée" }
  ] })]);
  const result = await planSteps({ description: "Saut en hauteur, la taille reste à définir", catalog, generate });
  assert.equal(result.status, "steps");
  assert.deepEqual(result.steps.map(s => s.pathId), ["value", "test"]);
  assert.match(prompts[0].prompt, /ajoute une étape qui la crée/);
});

test("no known path, an explicit none, or a question about a rule value", async () => {
  assert.deepEqual(await planSteps({ description: "x", catalog, generate: scripted(['{"none": "Pas de repos."}']).generate }), { status: "noPath", reason: "Pas de repos." });
  assert.equal((await planSteps({ description: "x", catalog, generate: scripted(['{"steps": [{"pathId": "nope"}]}']).generate })).status, "noPath");
  assert.deepEqual(await planSteps({ description: "x", catalog, generate: scripted(['{"question": "Quel dé ?"}']).generate }), { status: "question", question: "Quel dé ?" });
});

test("a step is filled with what earlier steps created, and planned", async () => {
  const { prompts, generate } = scripted(['{"answers": {"subject": {"use": "height"}}, "explanation": "Crée le test."}']);
  const done = [{ pathId: "value", goal: "Hauteur", created: [{ collection: "definitions", id: "height" }] }];
  const result = await fillStep({ description: "Saut", step: { pathId: "test", goal: "Test" }, done, catalog, generate,
    describePath: async () => ({ id: "test" }), plan: async () => ({ valid: true }) });
  assert.equal(result.status, "planned");
  assert.match(prompts[0].prompt, /"id":"height"/);
});

test("a refused plan goes back with its errors, two retries at most", async () => {
  const { prompts, generate } = scripted(['{"answers": {"r": "x"}}', '{"answers": {"r": "y"}}', '{"answers": {"r": "z"}}']);
  let plans = 0;
  const result = await fillStep({ description: "Rafale", step: { pathId: "test", goal: "" }, catalog, generate, describePath: async () => ({}),
    plan: async () => { plans++; return { valid: false, errors: [{ path: "r", code: "TYPE", detail: "integer" }] }; } });
  assert.equal(plans, 3);
  assert.equal(result.status, "invalid");
  assert.match(prompts[2].prompt, /TYPE/);
});
