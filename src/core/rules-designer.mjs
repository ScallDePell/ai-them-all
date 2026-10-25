/* The rules designer: the GM's rule in words becomes the answers of one Rule Them'All assistant path. The AI only
   proposes answers; Rule Them'All's plan checks them, and the GM applies them from the assistant's own preview.
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

export function buildChoosePrompt(description, summary) {
  return {
    system: SYSTEM,
    prompt: [
      `Règle décrite par le MJ :\n${description.trim()}`,
      `Parcours disponibles :\n${JSON.stringify(summary)}`,
      "Choisis le parcours qui exprime le mieux cette règle. Réponds avec l'un de ces objets :",
      '{"pathId": "<id du parcours>", "explanation": "<une phrase>"}',
      '{"none": "<pourquoi aucun parcours ne convient, et ce qu\'il faudrait ajouter à Rule Them\'All>"}',
      '{"question": "<la question à poser au MJ si la règle est trop ambiguë pour choisir>"}'
    ].join("\n\n")
  };
}

export function buildFillPrompt(description, path, { answerFormats = {}, previous = null } = {}) {
  const lines = [
    `Règle décrite par le MJ :\n${description.trim()}`,
    `Parcours choisi (questions, choix possibles et entrées existantes du Ruleset) :\n${JSON.stringify(path)}`,
    `Format des réponses selon le type de question :\n${JSON.stringify(answerFormats)}`,
    "Réutilise les entrées existantes quand elles conviennent. Réponds avec l'un de ces objets :",
    '{"answers": {"<id de question>": <réponse>}, "explanation": "<une phrase sur ce que crée ce parcours>"}',
    '{"question": "<la valeur manquante à demander au MJ>"}'
  ];
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
 * Chooses a path, fills it, and has it planned; a refused plan goes back to the AI with its errors, at most
 * MAX_RETRIES more times. Resolves with:
 * {status: "planned", pathId, answers, plan, explanation} | {status: "question", question} | {status: "noPath", reason}
 * | {status: "invalid", pathId, answers, errors}.
 */
export async function designRule({ description, catalog, describePath, plan, generate, maxRetries = MAX_RETRIES, onStep = () => {} }) {
  const summary = catalogSummary(catalog);
  onStep("choose");
  const choice = parseJsonAnswer(await generate(buildChoosePrompt(description, summary)));
  if (choice?.question) return { status: "question", question: String(choice.question) };
  if (!choice || choice.none || !summary.some(path => path.id === choice.pathId)) {
    return { status: "noPath", reason: String(choice?.none ?? "") };
  }
  const pathId = choice.pathId;
  const path = await describePath(pathId, {});
  let previous = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onStep("fill", attempt);
    const filled = parseJsonAnswer(await generate(buildFillPrompt(description, path, { answerFormats: catalog.answerFormats, previous })));
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
    if (result?.valid) return { status: "planned", pathId, answers, plan: result, explanation: String(filled.explanation ?? choice.explanation ?? "") };
    previous = { answers, errors: result?.errors ?? [] };
  }
  return { status: "invalid", pathId, answers: previous?.answers ?? {}, errors: previous?.errors ?? [] };
}
