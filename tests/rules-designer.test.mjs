import { test } from "node:test";
import assert from "node:assert/strict";
import { collectInventory, fillStep, listContentFields, parseJsonAnswer, planSteps } from "../src/core/rules-designer.mjs";

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
    { pathId: "test", goal: "Test de saut en hauteur" }
  ] })]);
  const result = await planSteps({ description: "Saut en hauteur, la taille reste à définir", catalog, generate });
  assert.equal(result.status, "steps");
  assert.deepEqual(result.steps.map(s => s.pathId), ["value", "test"]);
  assert.match(prompts[0].prompt, /ajoute une étape qui la crée/);
});

test("no known path, an explicit none, or a question about a rule value", async () => {
  assert.deepEqual(await planSteps({ description: "x", catalog, generate: scripted(['{"none": "Pas de repos."}']).generate }), { status: "noPath", reason: "Pas de repos." });
  const unknown = await planSteps({ description: "x", catalog, generate: scripted(['{"steps": [{"pathId": "nope"}]}', '{"steps": [{"pathId": "Valeur"}]}']).generate });
  assert.equal(unknown.status, "unusable");
  assert.match(unknown.reason, /"Valeur"/);
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

test("the inventory lists the entries the paths may reuse, once each, list fields included", async () => {
  const described = {
    value: { questions: [{ kind: "entry", accept: { collection: "definitions" }, choices: [{ id: "strength", nameKey: "Force" }] }] },
    test: { questions: [
      { kind: "entries", accept: { collection: "definitions" }, choices: [{ id: "strength", nameKey: "Force" }] },
      { kind: "list", fields: [{ kind: "entry", accept: { collection: "conditions" }, choices: [{ id: "success" }] }] }
    ] }
  };
  const inventory = await collectInventory(catalog, async id => described[id]);
  assert.deepEqual(inventory, [
    { collection: "definitions", id: "strength", name: "Force" },
    { collection: "conditions", id: "success", name: "success" }
  ]);
});

test("existing entries are sent with the steps request, and steps say what they reuse", async () => {
  const { prompts, generate } = scripted(['{"steps": [{"pathId": "test", "goal": "Test", "reuses": ["strength"]}]}']);
  const result = await planSteps({ description: "Saut", catalog, inventory: [{ collection: "definitions", id: "strength", name: "Force" }], generate });
  assert.match(prompts[0].prompt, /"id":"strength"/);
  assert.match(prompts[0].prompt, /ne donne jamais d'étape de création/);
  assert.deepEqual(result.steps, [{ pathId: "test", goal: "Test", reuses: ["strength"] }]);
});

test("a malformed formula goes back to the AI without reaching the assistant", async () => {
  const bad = '{"answers": {"expression": {"type": "add", "args": [{"type": ""}]}}}';
  const good = '{"answers": {"expression": {"type": "literal", "value": 1}}}';
  const { prompts, generate } = scripted([bad, good]);
  let plans = 0;
  const result = await fillStep({ description: "x", step: { pathId: "test", goal: "" }, catalog, generate,
    describePath: async () => ({ questions: [{ id: "expression", kind: "formula" }] }), plan: async () => { plans++; return { valid: true, warnings: [] }; } });
  assert.equal(plans, 1);
  assert.equal(result.status, "planned");
  assert.match(prompts[0].prompt, /"type": "reference"/);
  assert.match(prompts[1].prompt, /UNKNOWN_OPERATION/);
});

test("malformed to the end: not openable in the assistant", async () => {
  const bad = '{"answers": {"expression": {"type": "reference", "reference": {}}}}';
  const result = await fillStep({ description: "x", step: { pathId: "test", goal: "" }, catalog, generate: scripted([bad, bad, bad]).generate,
    describePath: async () => ({ questions: [{ id: "expression", kind: "formula" }] }), plan: async () => assert.fail("never planned") });
  assert.equal(result.status, "invalid");
  assert.equal(result.openable, false);
});

test("warnings get one more try, and are kept on the last one", async () => {
  const answer = '{"answers": {"n": 1}}';
  let plans = 0;
  const result = await fillStep({ description: "x", step: { pathId: "test", goal: "" }, catalog, generate: scripted([answer, answer, answer]).generate,
    describePath: async () => ({ questions: [] }), plan: async () => { plans++; return { valid: true, warnings: [{ code: "INCOMPLETE" }] }; } });
  assert.equal(plans, 3);
  assert.equal(result.status, "planned");
  assert.equal(result.warnings.length, 1);
});

test("an unreadable or unknown-path answer gets one more try with the reason", async () => {
  const { prompts, generate } = scripted(['{"steps": [{"pathId": "Test d\'attaque"}', '{"steps": [{"pathId": "nope"}]}', '{"steps": [{"pathId": "test", "goal": "Test"}]}']);
  const garbled = await planSteps({ description: "Rafale", catalog, generate });
  assert.equal(garbled.status, "unusable");
  assert.match(prompts[1].prompt, /pas un objet JSON/);
  const fixed = await planSteps({ description: "Rafale", catalog, generate: scripted(['{"steps": [{"pathId": "Test"}]}', '{"steps": [{"pathId": "test", "goal": "Test"}]}']).generate });
  assert.equal(fixed.status, "steps");
});

test("the GM's answers go with the next requests, and identifiers are never asked", async () => {
  const { prompts, generate } = scripted(['{"answers": {"n": 1}}']);
  await fillStep({ description: "Rafale", step: { pathId: "test", goal: "" }, catalog, generate,
    clarifications: [{ question: "Combien de séquences au plus ?", answer: "3" }],
    describePath: async () => ({ questions: [{ id: "expression", kind: "formula" }] }), plan: async () => ({ valid: true }) });
  assert.match(prompts[0].prompt, /Combien de séquences au plus \? → 3/);
  assert.match(prompts[0].system, /Ne demande jamais un identifiant/);
  assert.match(prompts[0].prompt, /variables\.input\./);
});

test("each path is summarized with what its questions accept", async () => {
  const { catalogSummary } = await import("../src/core/rules-designer.mjs");
  const [cost] = catalogSummary({ paths: [{ id: "cost", questions: [
    { id: "resource", kind: "entry", accept: { collection: "definitions", capability: "pool" } },
    { id: "amount", kind: "number" },
    { id: "writes", kind: "choice", options: [{ value: "definition" }, { value: "contentField" }] },
    { id: "rows", kind: "list", fields: [{ id: "f", kind: "formula" }] }
  ] }] });
  assert.deepEqual(cost.questions, ["resource:entry<definitions/pool>", "amount:number", "writes:choice(definition|contentField)", "rows:list[f:formula]"]);
});

test("the Content Types' fields go with both requests, as fields read by contentField and never created", async () => {
  const ruleset = { contentTypes: [
    { id: "weapon", nameKey: "Arme", fields: { ammo: { name: "Munitions", type: "number" }, damage: { name: "Dégâts" } } },
    { id: "gear", fields: { ammo: { name: "Munitions" } } }
  ] };
  const contentFields = listContentFields(ruleset);
  assert.deepEqual(contentFields.map(f => [f.id, f.contentTypes]), [["ammo", ["Arme", "gear"]], ["damage", ["Arme"]]]);
  assert.deepEqual(listContentFields(null), []);
  const steps = scripted(['{"steps": [{"pathId": "value", "goal": "Total"}]}']);
  await planSteps({ description: "Rafale", catalog, contentFields, generate: steps.generate });
  assert.match(steps.prompts[0].prompt, /contentField[\s\S]*"id":"ammo"/);
  const fill = scripted(['{"answers": {}}']);
  await fillStep({ description: "Rafale", step: { pathId: "test", goal: "Condition" }, contentFields, catalog, generate: fill.generate,
    describePath: async () => ({ id: "test" }), plan: async () => ({ valid: true }) });
  assert.match(fill.prompts[0].prompt, /ne se créent jamais[\s\S]*"name":"Munitions"/);
});
