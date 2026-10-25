/* A step Rule Them'All's assistant has no path for: configure a Content Template (a weapon "Fusil d'assaut"), giving
   it Actions and setting its field values, or create it first when the Ruleset lacks it. The AI names the template,
   possibly misspelled, and says what to change; this module finds the template (or its Content Type), checks the
   change against the Ruleset and builds what the stable configurator's updateContentTemplate or createContentTemplate
   takes. Nothing is written here: the GM applies it from the
   panel. Pure. */

import { MAX_RETRIES, clarified, parseJsonAnswer } from "./rules-designer.mjs";

export const CONTENT_PATH_ID = "ai-them-all.configureContent";

/** Shown to the AI with the assistant's paths, in the same shape. */
export const CONTENT_PATH = Object.freeze({
  id: CONTENT_PATH_ID, group: "ai-them-all", title: "Créer ou configurer un Modèle de Contenu",
  summary: "Configure un Modèle de Contenu (un objet, une arme comme « Fusil d'assaut ») : lui donne des actions et règle les valeurs de ses champs ; le crée s'il n'existe pas encore. Son Type de Contenu (ex. Arme, avec ses champs) doit exister ou être créé par une étape contentType précédente ; à placer après les étapes qui créent les actions qu'il donne.",
  keywords: ["contenu", "objet", "arme", "item", "équipement", "configurer", "existant"],
  questions: [
    { id: "template", kind: "entry", accept: { collection: "contentTemplates" } },
    { id: "grant", kind: "entries", accept: { collection: "actions" } },
    { id: "fields", kind: "object" }
  ]
});

/** The catalog with this step's path added, once. */
export const withContentPath = catalog => ({ ...catalog, paths: [...(catalog?.paths ?? []).filter(p => p.id !== CONTENT_PATH_ID), CONTENT_PATH] });

const nameOf = entry => entry?.nameKey || entry?.name || entry?.id;

/** The Content Templates as the AI sees them: id, name, type, field values and the Actions they already give. */
export function listContentTemplates(ruleset, limit = 200) {
  const types = new Map((ruleset?.contentTypes ?? []).map(type => [type.id, type]));
  return (ruleset?.contentTemplates ?? []).slice(0, limit).map(template => ({
    id: template.id, name: nameOf(template), contentType: nameOf(types.get(template.contentTypeId)) ?? template.contentTypeId,
    fields: Object.keys(types.get(template.contentTypeId)?.fields ?? {}), data: template.data ?? {},
    grants: (template.relations ?? []).filter(r => r?.operation === "grant" && r.targetRef?.objectKind === "action").map(r => r.targetRef.objectId)
  }));
}

/** Lower case, no accents, no punctuation: "Fusil d'Assault" and "fusil d assault" read alike. */
export const normalizeName = text => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** The template named by id or by name, small spelling mistakes allowed; null when none is close enough or two are. */
export function findTemplate(templates, wanted) {
  const exact = templates.find(t => t.id === wanted);
  if (exact) return exact;
  const key = normalizeName(wanted);
  if (!key) return null;
  const scored = templates.map(t => ({ t, d: Math.min(distance(key, normalizeName(t.name)), distance(key, normalizeName(t.id))) })).sort((x, y) => x.d - y.d);
  const best = scored[0];
  if (!best || best.d > Math.max(2, Math.floor(key.length / 4))) return null;
  return scored[1]?.d === best.d ? null : best.t;
}

const slug = text => normalizeName(text).replace(/ /g, "-") || "contenu";

/**
 * Checks the AI's answer {template, grant, fields} against the Ruleset. Resolves the patch for updateContentTemplate
 * and what it changes: {valid: true, templateId, name, patch, grants, fields: [{id, from, to}]} | {valid: false, errors}.
 * A template the Ruleset lacks is created when the answer says {create: {name, contentType}}: the result then has
 * create: true and entry, the whole new template, instead of patch.
 */
export function planContentChange(ruleset, answer) {
  const templates = listContentTemplates(ruleset, Infinity);
  const template = findTemplate(templates, answer?.template);
  if (!template) {
    if (answer?.create && typeof answer.create === "object") return planContentCreation(ruleset, templates, answer);
    return { valid: false, errors: [{ code: "TEMPLATE", detail: `Aucun Modèle de Contenu ne correspond à ${JSON.stringify(answer?.template ?? "")} : choisis un id de la liste, ou ajoute "create": {"name", "contentType"} pour le créer.` }] };
  }
  const errors = [];
  const actions = new Set((ruleset?.actions ?? []).map(a => a.id));
  const grant = Array.isArray(answer?.grant) ? answer.grant.map(String) : [];
  for (const id of grant) if (!actions.has(id)) errors.push({ code: "ACTION", detail: `L'action ${id} n'existe pas dans le Ruleset.` });
  const fields = answer?.fields && typeof answer.fields === "object" && !Array.isArray(answer.fields) ? answer.fields : {};
  for (const id of Object.keys(fields)) if (!template.fields.includes(id)) errors.push({ code: "FIELD", detail: `Le champ ${id} n'existe pas pour le type ${template.contentType} (champs : ${template.fields.join(", ") || "aucun"}).` });
  if (errors.length) return { valid: false, errors };
  const source = (ruleset.contentTemplates ?? []).find(t => t.id === template.id);
  const relations = [...(source.relations ?? [])];
  const ids = new Set(relations.map(r => r?.id));
  const added = grant.filter((id, i) => !template.grants.includes(id) && grant.indexOf(id) === i);
  for (const actionId of added) {
    let id = `grant-${actionId}`;
    for (let n = 2; ids.has(id); n++) id = `grant-${actionId}-${n}`;
    ids.add(id);
    relations.push({ id, operation: "grant", targetRef: { objectKind: "action", objectId: actionId } });
  }
  const changed = Object.entries(fields).filter(([id, value]) => JSON.stringify(template.data[id]) !== JSON.stringify(value));
  if (!added.length && !changed.length) return { valid: false, errors: [{ code: "NOTHING", detail: `${template.name} a déjà ces actions et ces valeurs : rien à changer.` }] };
  const patch = {};
  if (added.length) patch.relations = relations;
  if (changed.length) patch.data = { ...source.data, ...Object.fromEntries(changed) };
  return { valid: true, templateId: template.id, name: template.name, patch, grants: added, fields: changed.map(([id, to]) => ({ id, from: template.data[id], to })) };
}

const checkGrantsAndFields = (ruleset, grant, fields, fieldIds, typeName) => {
  const actions = new Set((ruleset?.actions ?? []).map(a => a.id));
  return [
    ...grant.filter(id => !actions.has(id)).map(id => ({ code: "ACTION", detail: `L'action ${id} n'existe pas dans le Ruleset.` })),
    ...Object.keys(fields).filter(id => !fieldIds.includes(id)).map(id => ({ code: "FIELD", detail: `Le champ ${id} n'existe pas pour le type ${typeName} (champs : ${fieldIds.join(", ") || "aucun"}).` }))
  ];
};

function planContentCreation(ruleset, templates, answer) {
  const name = String(answer.create.name ?? answer.template ?? "").trim();
  const types = (ruleset?.contentTypes ?? []).map(type => ({ id: type.id, name: nameOf(type), fields: Object.keys(type.fields ?? {}) }));
  const type = findTemplate(types, answer.create.contentType);
  const errors = [];
  if (!name) errors.push({ code: "NAME", detail: "create a besoin du nom du Modèle." });
  if (!type) errors.push({ code: "CONTENT_TYPE", detail: `Aucun Type de Contenu ne correspond à ${JSON.stringify(answer.create.contentType ?? "")} (types : ${types.map(t => t.id).join(", ") || "aucun ; une étape contentType doit le créer avant"}).` });
  if (errors.length) return { valid: false, errors };
  const grant = Array.isArray(answer.grant) ? [...new Set(answer.grant.map(String))] : [];
  const fields = answer.fields && typeof answer.fields === "object" && !Array.isArray(answer.fields) ? answer.fields : {};
  errors.push(...checkGrantsAndFields(ruleset, grant, fields, type.fields, type.name));
  if (errors.length) return { valid: false, errors };
  const taken = new Set(templates.map(t => t.id));
  let id = slug(answer.create.id || name);
  for (let n = 2, base = id; taken.has(id); n++) id = `${base}-${n}`;
  const entry = { id, nameKey: name, contentTypeId: type.id, data: { ...fields },
    relations: grant.map(actionId => ({ id: `grant-${actionId}`, operation: "grant", targetRef: { objectKind: "action", objectId: actionId } })) };
  return { valid: true, create: true, templateId: id, name, contentType: type.name, entry, grants: grant, fields: Object.entries(fields).map(([fid, to]) => ({ id: fid, from: undefined, to })) };
}

export function buildContentPrompt(description, { goal = "", done = [], templates = [], contentTypes = [], actions = [], clarifications = [], previous = null } = {}) {
  const lines = [
    `Règle décrite par le MJ :\n${description.trim()}`,
    clarified(clarifications),
    goal && `Étape à remplir maintenant : ${goal}`,
    done.length && `Étapes déjà appliquées et entrées qu'elles ont créées :\n${JSON.stringify(done)}`,
    `Modèles de Contenu du Ruleset (id, nom, type, champs, valeurs, actions déjà données) :\n${JSON.stringify(templates)}`,
    `Types de Contenu du Ruleset (id, nom, champs) :\n${JSON.stringify(contentTypes)}`,
    `Actions du Ruleset (id, nom) :\n${JSON.stringify(actions)}`,
    "Le MJ peut avoir mal orthographié le nom du Contenu : choisis le Modèle dont le nom est le plus proche et donne son id.",
    "Si aucun Modèle ne correspond, crée-le : donne son nom dans template et ajoute \"create\": {\"name\": \"<nom>\", \"contentType\": \"<id du Type de Contenu>\"}.",
    "Ne change que ce que la règle demande pour ce Contenu. Les valeurs de champs sont celles de la règle, jamais inventées.",
    "Réponds avec l'un de ces objets :",
    '{"template": "<id du Modèle>", "grant": ["<id d\'action à donner>"], "fields": {"<id de champ>": <valeur>}, "explanation": "<une phrase>"}',
    '{"template": "<nom>", "create": {"name": "<nom>", "contentType": "<id du Type>"}, "grant": [...], "fields": {...}, "explanation": "<une phrase>"}',
    '{"question": "<la valeur de règle manquante à demander au MJ>"}'
  ].filter(Boolean);
  if (previous) lines.push(`Ta réponse précédente :\n${JSON.stringify(previous.answer)}\n\nElle a été refusée ; corrige-la :\n${JSON.stringify(previous.errors)}`);
  return { system: "Tu configures un Contenu existant d'un Ruleset de Rule Them'All, un module Foundry VTT. Tu ne réponds qu'en JSON, sans texte autour.", prompt: lines.join("\n\n") };
}

/**
 * Fills the step from the Ruleset as it is now (readRuleset), earlier steps applied. Resolves with
 * {status: "planned", pathId, change, explanation} | {status: "question", question} | {status: "invalid", errors}.
 */
export async function fillContentStep({ description, step, done = [], clarifications = [], readRuleset, generate, maxRetries = MAX_RETRIES, onAttempt = () => {} }) {
  const ruleset = readRuleset();
  if (!ruleset) return { status: "invalid", errors: [{ code: "RULESET", detail: "Le Ruleset n'a pas pu être lu." }] };
  const templates = listContentTemplates(ruleset);
  const contentTypes = (ruleset.contentTypes ?? []).map(type => ({ id: type.id, name: nameOf(type), fields: Object.keys(type.fields ?? {}) }));
  const actions = (ruleset.actions ?? []).map(a => ({ id: a.id, name: nameOf(a) }));
  let previous = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onAttempt(attempt);
    const answer = parseJsonAnswer(await generate(buildContentPrompt(description, { goal: step.goal, done, templates, contentTypes, actions, clarifications, previous })));
    if (answer?.question) return { status: "question", question: String(answer.question) };
    const change = answer ? planContentChange(ruleset, answer) : { valid: false, errors: [{ code: "FORMAT", detail: "La réponse n'était pas un objet JSON." }] };
    if (change.valid) return { status: "planned", pathId: CONTENT_PATH_ID, change, explanation: String(answer.explanation ?? step.goal ?? "") };
    previous = { answer, errors: change.errors };
  }
  return { status: "invalid", errors: previous?.errors ?? [] };
}
