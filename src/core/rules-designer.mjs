/* The rules designer: the GM's rule in words becomes ordered steps, each the answers of one Rule Them'All assistant
   path; an entry the rule needs and the Ruleset lacks is a step of its own, not a question. The AI only proposes
   answers; Rule Them'All's plan checks them, and the GM applies each step from the assistant's own preview.
   Pure: the AI call (generate), the path description and the plan are given. */

import { EXPRESSION_GUIDE, checkExpressionAnswers, hasExpressionQuestion } from "./expressions.mjs";

export const MAX_RETRIES = 2;

const SYSTEM = [
  "Tu aides un MJ à saisir une règle de jeu de rôle dans l'assistant de Rule Them'All, un module Foundry VTT.",
  "L'assistant propose des parcours : chacun pose des questions et crée des entrées du Ruleset à partir des réponses.",
  "Tu ne réponds qu'en JSON, sans texte autour.",
  "N'invente aucune valeur de règle absente du texte du MJ : si une valeur obligatoire manque, demande-la.",
  "Ne demande jamais un identifiant ou un nom technique au MJ : choisis-le toi-même (minuscules, chiffres, tirets) et réutilise le même dans les étapes suivantes."
].join(" ");

/** What the AI needs to choose a path: words only, no questions yet. */
export function catalogSummary(catalog) {
  return (catalog?.paths ?? []).map(path => ({
    id: path.id, group: path.group, title: path.title, summary: path.summary, limits: path.limits, keywords: path.keywords ?? []
  }));
}

export const INVENTORY_LIMIT = 400;

/**
 * The entries the Ruleset already has, as the assistant offers them in its questions: {collection, id, name}.
 * Read from each path's description, so only what a path may reuse; names are the Ruleset's own names or keys.
 */
export async function collectInventory(catalog, describePath) {
  const found = new Map();
  const walk = questions => {
    for (const question of questions ?? []) {
      if ((question.kind === "entry" || question.kind === "entries") && question.accept?.collection) {
        for (const choice of question.choices ?? []) {
          const key = `${question.accept.collection}:${choice.id}`;
          if (!found.has(key)) found.set(key, { collection: question.accept.collection, id: choice.id, name: choice.nameKey ?? choice.id });
        }
      }
      if (question.kind === "list") walk(question.fields);
    }
  };
  for (const path of catalog?.paths ?? []) {
    try { walk((await describePath(path.id, {}))?.questions); } catch { /* a path that cannot be described adds nothing */ }
    if (found.size >= INVENTORY_LIMIT) break;
  }
  return [...found.values()].slice(0, INVENTORY_LIMIT);
}

const clarified = clarifications => clarifications?.length
  ? `Précisions du MJ, en réponse à tes questions :\n${clarifications.map(c => `- ${c.question} → ${c.answer}`).join("\n")}` : "";

export function buildStepsPrompt(description, summary, inventory = [], previous = null, clarifications = []) {
  const retry = previous ? [`Ta réponse précédente n'a pas pu être utilisée : ${previous}. Réponds de nouveau avec un seul objet JSON valide.`] : [];
  return {
    system: SYSTEM,
    prompt: [
      `Règle décrite par le MJ :\n${description.trim()}`,
      ...[clarified(clarifications)].filter(Boolean),
      `Parcours disponibles :\n${JSON.stringify(summary)}`,
      `Entrées qui existent déjà dans le Ruleset (collection, id, nom) :\n${JSON.stringify(inventory)}`,
      "Découpe cette règle en une liste ordonnée d'étapes, une par parcours. Une règle complexe se construit en combinant plusieurs parcours (briques comme formula, condition, cost, action, et parcours comme test ou attack) : réponds none seulement si aucune combinaison ne convient.",
      "Utilise exactement les id de parcours de la liste (champ id), jamais leur titre.",
      "Vérifie d'abord dans les entrées existantes : une entrée qui existe déjà (même sous un autre nom proche, ou un id équivalent) se réutilise et ne donne jamais d'étape de création.",
      "Si la règle a besoin d'une entrée absente de cette liste (une définition comme une taille ou une hauteur, un paramètre, une formule…), ajoute une étape qui la crée avant l'étape qui l'utilise : ne pose pas de question pour ça.",
      "Pour chaque étape, indique les entrées existantes qu'elle réutilise.",
      "Ne pose une question que si une valeur de la règle elle-même manque dans le texte du MJ (un nombre, un dé, un seuil).",
      "Réponds avec l'un de ces objets :",
      '{"steps": [{"pathId": "<id du parcours>", "goal": "<ce que crée cette étape, en une phrase>", "reuses": ["<id d\'entrée existante>"]}], "explanation": "<une phrase>"}',
      '{"none": "<pourquoi aucun parcours ne convient, et ce qu\'il faudrait ajouter à Rule Them\'All>"}',
      '{"question": "<la valeur de règle à demander au MJ>"}',
      ...retry
    ].join("\n\n")
  };
}

export function buildFillPrompt(description, path, { answerFormats = {}, goal = "", done = [], previous = null, clarifications = [] } = {}) {
  const lines = [
    `Règle décrite par le MJ :\n${description.trim()}`,
    clarified(clarifications),
    goal && `Étape à remplir maintenant : ${goal}`,
    done.length && `Étapes déjà appliquées et entrées qu'elles ont créées (réutilise leurs id) :\n${JSON.stringify(done)}`,
    `Parcours de cette étape (questions, choix possibles et entrées existantes du Ruleset) :\n${JSON.stringify(path)}`,
    `Format des réponses selon le type de question :\n${JSON.stringify(answerFormats)}`,
    hasExpressionQuestion(path?.questions) && EXPRESSION_GUIDE,
    "Réutilise les entrées existantes quand elles conviennent. Si une entrée manque et que la question permet create, crée-la avec {\"create\": {...}} plutôt que de poser une question.",
    "Réponds avec l'un de ces objets :",
    '{"answers": {"<id de question>": <réponse>}, "explanation": "<une phrase sur ce que crée cette étape>"}',
    '{"question": "<la valeur de règle manquante à demander au MJ>"}'
  ].filter(Boolean);
  if (previous) {
    lines.push(`Ta réponse précédente :\n${JSON.stringify(previous.answers)}`);
    lines.push(`L'assistant l'a refusée avec ces erreurs ; corrige-la :\n${JSON.stringify(previous.errors)}`);
  }
  return { system: SYSTEM, prompt: lines.join("\n\n") };
}

/** The first JSON object of an answer, fenced or not; null when there is none. */
export function parseJsonAnswer(text) {
  const raw = String(text ?? "");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{"), end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(fenced.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Splits the rule into ordered steps, one assistant path each. Resolves with
 * {status: "steps", steps: [{pathId, goal, reuses}], explanation} | {status: "question", question} | {status: "noPath", reason}
 * | {status: "unusable", reason} when the AI's answer could not be read, even after one more try.
 */
export async function planSteps({ description, catalog, inventory = [], clarifications = [], generate, maxRetries = 1 }) {
  const summary = catalogSummary(catalog);
  const known = new Set(summary.map(path => path.id));
  let previous = null, reason = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const answer = parseJsonAnswer(await generate(buildStepsPrompt(description, summary, inventory, previous, clarifications)));
    if (answer?.question) return { status: "question", question: String(answer.question) };
    if (answer?.none !== undefined && !answer?.steps) return { status: "noPath", reason: String(answer.none || "") };
    const proposed = Array.isArray(answer?.steps) ? answer.steps : null;
    if (!proposed) {
      reason = previous = "ce n'était pas un objet JSON avec steps";
      continue;
    }
    const unknown = proposed.map(step => step?.pathId).filter(id => !known.has(id));
    const steps = proposed.filter(step => known.has(step?.pathId))
      .map(step => ({ pathId: step.pathId, goal: String(step.goal ?? ""), reuses: Array.isArray(step.reuses) ? step.reuses.map(String) : [] }));
    if (unknown.length) {
      reason = previous = `ces id de parcours n'existent pas : ${unknown.map(id => JSON.stringify(id ?? null)).join(", ")}`;
      continue;
    }
    if (!steps.length) {
      reason = previous = "la liste steps était vide";
      continue;
    }
    return { status: "steps", steps, explanation: String(answer.explanation ?? "") };
  }
  return { status: "unusable", reason };
}

/**
 * Fills one step and has it planned; a refused plan goes back to the AI with its errors, at most MAX_RETRIES more
 * times. done lists the steps already applied with what they created. Resolves with
 * {status: "planned", pathId, answers, plan, warnings, explanation} | {status: "question", question}
 * | {status: "invalid", pathId, answers, errors, openable}.
 */
export async function fillStep({ description, step, done = [], clarifications = [], catalog, describePath, plan, generate, maxRetries = MAX_RETRIES, onAttempt = () => {} }) {
  const { pathId, goal } = step;
  const path = await describePath(pathId, {});
  let previous = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onAttempt(attempt);
    const filled = parseJsonAnswer(await generate(buildFillPrompt(description, path, { answerFormats: catalog?.answerFormats, goal, done, previous, clarifications })));
    if (filled?.question) return { status: "question", question: String(filled.question) };
    const answers = filled?.answers && typeof filled.answers === "object" ? filled.answers : null;
    if (!answers) {
      previous = { answers: null, errors: [{ code: "FORMAT", detail: "La réponse n'était pas un objet JSON avec answers." }] };
      continue;
    }
    // An expression the assistant's form cannot show is sent back before the assistant sees it.
    const malformed = checkExpressionAnswers(path?.questions, answers);
    if (malformed.length) {
      previous = { answers, errors: malformed };
      continue;
    }
    let result;
    try {
      result = await plan(pathId, answers);
    } catch (error) {
      result = { valid: false, errors: [{ code: "PLAN", detail: error?.message ?? String(error) }] };
    }
    // What would stay to complete before publishing goes back once more while tries remain.
    const warnings = result?.warnings ?? [];
    if (result?.valid && (!warnings.length || attempt === maxRetries)) {
      return { status: "planned", pathId, answers, plan: result, warnings, explanation: String(filled.explanation ?? goal) };
    }
    previous = { answers, errors: result?.valid ? warnings : result?.errors ?? [] };
  }
  const answers = previous?.answers ?? {};
  // Answers the assistant's form cannot show are not opened in it.
  return { status: "invalid", pathId, answers, errors: previous?.errors ?? [], openable: !checkExpressionAnswers(path?.questions, answers).length };
}
