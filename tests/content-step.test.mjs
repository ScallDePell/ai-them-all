import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_PATH_ID, fillContentStep, findTemplate, listContentTemplates, planContentChange, withContentPath } from "../src/core/content-step.mjs";
import { catalogSummary, planSteps } from "../src/core/rules-designer.mjs";

const ruleset = () => ({
  contentTypes: [{ id: "arme", nameKey: "Arme", fields: { munitions: { name: "Munitions" }, cadence: { name: "Cadence" } } }],
  contentTemplates: [
    { id: "fusil-assaut", nameKey: "Fusil d'assaut", contentTypeId: "arme", data: { munitions: 30 }, relations: [{ id: "grant-tir", operation: "grant", targetRef: { objectKind: "action", objectId: "tir" } }] },
    { id: "pistolet", nameKey: "Pistolet", contentTypeId: "arme", data: {} }
  ],
  actions: [{ id: "tir", nameKey: "Tir" }, { id: "tir-rafale", nameKey: "Tir en rafale" }]
});
const scripted = replies => {
  const prompts = [];
  return { prompts, generate: async prompt => { prompts.push(prompt); return replies.shift(); } };
};

test("a template is found by id or by a misspelled name, never by a guess between two", () => {
  const templates = listContentTemplates(ruleset());
  assert.equal(findTemplate(templates, "fusil-assaut")?.id, "fusil-assaut");
  assert.equal(findTemplate(templates, "Fusil d'assault")?.id, "fusil-assaut");
  assert.equal(findTemplate(templates, "fusil dassaut")?.id, "fusil-assaut");
  assert.equal(findTemplate(templates, "Grenade"), null);
  assert.equal(findTemplate([{ id: "a", name: "Arc" }, { id: "b", name: "Arb" }], "Ar"), null);
});

test("giving an action and setting a field builds the patch, existing relations and values kept", () => {
  const change = planContentChange(ruleset(), { template: "Fusil d'assault", grant: ["tir-rafale", "tir"], fields: { cadence: 3 } });
  assert.equal(change.valid, true);
  assert.equal(change.templateId, "fusil-assaut");
  assert.deepEqual(change.grants, ["tir-rafale"]);
  assert.deepEqual(change.patch.relations.map(r => r.id), ["grant-tir", "grant-tir-rafale"]);
  assert.deepEqual(change.patch.relations[1].targetRef, { objectKind: "action", objectId: "tir-rafale" });
  assert.deepEqual(change.patch.data, { munitions: 30, cadence: 3 });
});

test("an unknown action or field, or nothing to change, is refused", () => {
  assert.deepEqual(planContentChange(ruleset(), { template: "pistolet", grant: ["vol"], fields: { poids: 2 } }).errors.map(e => e.code), ["ACTION", "FIELD"]);
  assert.deepEqual(planContentChange(ruleset(), { template: "fusil-assaut", grant: ["tir"], fields: { munitions: 30 } }).errors.map(e => e.code), ["NOTHING"]);
  assert.deepEqual(planContentChange(ruleset(), { template: "grenade" }).errors.map(e => e.code), ["TEMPLATE"]);
});

test("a refused answer goes back with its errors, then the step is planned from the Ruleset as it is now", async () => {
  const { prompts, generate } = scripted(['{"template": "fusil-assaut", "grant": ["rafale"]}', '{"template": "fusil-assaut", "grant": ["tir-rafale"], "explanation": "Donne la rafale."}']);
  const result = await fillContentStep({ description: "Rafale", step: { pathId: CONTENT_PATH_ID, goal: "Configurer le Fusil d'assault" }, readRuleset: ruleset, generate });
  assert.equal(result.status, "planned");
  assert.deepEqual(result.change.grants, ["tir-rafale"]);
  assert.match(prompts[0].prompt, /"name":"Fusil d'assaut"/);
  assert.match(prompts[1].prompt, /rafale n'existe pas/);
});

test("the AI sees the configure-content step among the paths, with the templates, and may choose it", async () => {
  const catalog = withContentPath({ paths: [{ id: "action", questions: [] }] });
  assert.equal(withContentPath(catalog).paths.length, 2);
  assert.ok(catalogSummary(catalog).some(p => p.id === CONTENT_PATH_ID && p.questions.includes("template:entry<contentTemplates>")));
  const { prompts, generate } = scripted([`{"steps": [{"pathId": "action", "goal": "Tir en rafale"}, {"pathId": "${CONTENT_PATH_ID}", "goal": "Donner la rafale au Fusil d'assaut"}]}`]);
  const result = await planSteps({ description: "Rafale ; configurer Fusil d'assault", catalog, contentTemplates: listContentTemplates(ruleset()), generate });
  assert.deepEqual(result.steps.map(s => s.pathId), ["action", CONTENT_PATH_ID]);
  assert.match(prompts[0].prompt, new RegExp(`${CONTENT_PATH_ID}[\\s\\S]*"id":"fusil-assaut"`));
});
