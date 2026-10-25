/* The rules designer: the GM's rule in words becomes ordered steps, each the answers of one Rule Them'All assistant
   path; an entry the rule needs and the Ruleset lacks is a step of its own, not a question. The AI only proposes
   answers; Rule Them'All's plan checks them, and the GM applies each step from the assistant's own preview.
   Pure: the AI call (generate), the path description and the plan are given. */

export const MAX_RETRIES = 2;

const SYSTEM = [
  "Tu aides un MJ à saisir une règle de jeu de rôle dans l'assistant de Rule Them'All, un module Foundry VTT.",
  "L'assistant propose des parcours : chacun pose des questions et crée des entrées du Ruleset à partir des réponses.",
  "Tu ne réponds qu'en JSON, sans texte autour.",
  "N'invente aucune valeur de règle absente du texte du MJ : si une valeur obligatoire manque, demande-la."
].join(" ");

/** What the AI needs to choose a path: words only, no questions yet. */
export function catalogSummary(catalog) {
  return (catalog?.paths ?? []).map(path => ({
    id: path.id, group: path.group, title: path.title, summary: path.summary, limits: path.limits, keywords: path.keywords ?? []
  }));
}

export function buildStepsPrompt(description, summary) {
  return {
    system: SYSTEM,
    prompt: [
      `Règle décrite par le MJ :\n${description.trim()}`,
      `Parcours disponibles :\n${JSON.stringify(summary)}`,
      "Découpe cette règle en une liste ordonnée d'étapes, une par parcours.",
      "Si la règle a besoin d'une entrée qui n'existe peut-être pas encore (une définition comme une taille ou une hauteur, un paramètre, une formule…), ajoute une étape qui la crée avant l'étape qui l'utilise : ne pose pas de question pour ça.",
      "Ne pose une question que si une valeur de la règle elle-même manque dans le texte du MJ (un nombre, un dé, un seuil).",
      "Réponds avec l'un de ces objets :",
      '{"steps": [{"pathId": "<id du parcours>", "goal": "<ce que crée cette étape, en une phrase>"}], "explanation": "<une phrase>"}',
      '{"none": "<pourquoi aucun parcours ne convient, et ce qu\'il faudrait ajouter à Rule Them\'All>"}',
      '{"question": "<la valeur de règle à demander au MJ>"}'
    ].join("\n\n")
  };
}

export function buildFillPrompt(description, path, { answerFormats = {}, goal = "", done = [], previous = null } = {}) {
  const lines = [
    `Règle décrite par le MJ :\n${description.trim()}`,
    goal && `Étape à remplir maintenant : ${goal}`,
    done.length && `Étapes déjà appliquées et entrées qu'elles ont créées (réutilise leurs id) :\n${JSON.stringify(done)}`,
    `Parcours de cette étape (questions, choix possibles et entrées existantes du Ruleset) :\n${JSON.stringify(path)}`,
    `Format des réponses selon le type de question :\n${JSON.stringify(answerFormats)}`,
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
 * {status: "steps", steps: [{pathId, goal}], explanation} | {status: "question", question} | {status: "noPath", reason}.
 */
export async function planSteps({ description, catalog, generate }) {
  const summary = catalogSummary(catalog);
  const answer = parseJsonAnswer(await generate(buildStepsPrompt(description, summary)));
  if (answer?.question) return { status: "question", question: String(answer.question) };
  const known = new Set(summary.map(path => path.id));
  const steps = (Array.isArray(answer?.steps) ? answer.steps : [])
    .filter(step => known.has(step?.pathId))
    .map(step => ({ pathId: step.pathId, goal: String(step.goal ?? "") }));
  if (!steps.length) return { status: "noPath", reason: String(answer?.none ?? "") };
  return { status: "steps", steps, explanation: String(answer.explanation ?? "") };
}

/**
 * Fills one step and has it planned; a refused plan goes back to the AI with its errors, at most MAX_RETRIES more
 * times. done lists the steps already applied with what they created. Resolves with
 * {status: "planned", pathId, answers, plan, explanation} | {status: "question", question} | {status: "invalid", pathId, answers, errors}.
 */
export async function fillStep({ description, step, done = [], catalog, describePath, plan, generate, maxRetries = MAX_RETRIES, onAttempt = () => {} }) {
  const { pathId, goal } = step;
  const path = await describePath(pathId, {});
  let previous = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onAttempt(attempt);
    const filled = parseJsonAnswer(await generate(buildFillPrompt(description, path, { answerFormats: catalog?.answerFormats, goal, done, previous })));
    if (filled?.question) return { status: "question", question: String(filled.question) };
    const answers = filled?.answers && typeof filled.answers === "object" ? filled.answers : null;
    if (!answers) {
      previous = { answers: null, errors: [{ code: "FORMAT", detail: "La réponse n'était pas un objet JSON avec answers." }] };
      continue;
    }
    let result;
    try {
      result = await plan(pathId, answers);
    } catch (error) {
      result = { valid: false, errors: [{ code: "PLAN", detail: error?.message ?? String(error) }] };
    }
    if (result?.valid) return { status: "planned", pathId, answers, plan: result, explanation: String(filled.explanation ?? goal) };
    previous = { answers, errors: result?.errors ?? [] };
  }
  return { status: "invalid", pathId, answers: previous?.answers ?? {}, errors: previous?.errors ?? [] };
}
