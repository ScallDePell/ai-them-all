/* What a Rule Them'All Formula or Condition answer must look like, to tell the AI and to check its answer before
   the assistant sees it: an expression the assistant's builder cannot show breaks its form. Mirrors the node types
   of Rule Them'All's expression builder (entry-expression-model.mjs). Pure. */

const OPERANDS = ["literal", "parameter", "formula", "reference", "context", "contentField", "dice", "distance", "nearby"];
const SHAPES = {
  add: "args", subtract: "args", multiply: "args", divide: "args", min: "args", max: "args", sum: "args", average: "args", and: "args", or: "args",
  mod: "duo", floor: "value", ceil: "value", round: "value", not: "value", clamp: "clamp", if: "if", rangeLookup: "range", lookup: "table",
  eq: "pair", neq: "pair", gt: "pair", gte: "pair", lt: "pair", lte: "pair"
};
const KEYS = { value: ["value"], pair: ["left", "right"], clamp: ["value", "min", "max"], if: ["condition", "then", "else"], range: ["value"], table: ["key"] };

export const EXPRESSION_GUIDE = [
  "Une formule ou une condition est un arbre JSON de nœuds. Feuilles :",
  '{"type": "literal", "value": 3} ; {"type": "parameter", "id": "<id d\'un Paramètre>"} ; {"type": "formula", "id": "<id d\'une Formule>"} ;',
  '{"type": "reference", "reference": {"objectKind": "definition", "objectId": "<id de la définition>", "capabilityId": "value", "outputId": "value.final"}} pour la valeur d\'une définition (capabilityId "pool" et outputId "pool.current" pour une réserve) ;',
  '{"type": "context", "path": "variables.test.margin"} pour le résultat d\'un test en cours : variables.test.total (total du jet), variables.test.natural (dé naturel), variables.test.margin (écart au DD, positif si réussi), variables.test.inputs.difficulty (DD).',
  '{"type": "context", "path": "variables.input.<id>"} pour une valeur choisie au lancement d\'une action (une entrée de l\'action, par exemple variables.input.sequences pour un nombre de séquences) ; si l\'entrée n\'existe pas encore, choisis son id toi-même : l\'étape qui crée l\'action la déclarera avec cet id.',
  'Opérations : {"type": "add"|"subtract"|"multiply"|"divide"|"min"|"max", "args": [nœuds]} ; {"type": "floor"|"ceil"|"round", "value": nœud} ;',
  '{"type": "gt"|"gte"|"lt"|"lte"|"eq"|"neq", "left": nœud, "right": nœud} ; {"type": "and"|"or", "args": [nœuds]} ; {"type": "if", "condition": nœud, "then": nœud, "else": nœud} ;',
  '{"type": "clamp", "value": nœud, "min": nœud, "max": nœud}.',
  "N'utilise aucun autre type. Chaque référence doit nommer une définition de la liste des entrées existantes ou créée par une étape précédente."
].join("\n");

const isNode = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** Problems of one expression answer, each {path, code, detail}; [] when the assistant can show it. */
export function checkExpression(node, path = "") {
  if (typeof node === "number" || typeof node === "boolean") return [];
  if (!isNode(node)) return [{ path, code: "NOT_A_NODE", detail: "Un nœud d'expression est un objet avec un type." }];
  const { type } = node;
  const out = [];
  const child = (key, value) => out.push(...checkExpression(value, `${path}.${key}`));
  if (OPERANDS.includes(type)) {
    if (type === "literal" && (isNode(node.value) || Array.isArray(node.value) || node.value === undefined)) out.push({ path, code: "LITERAL", detail: "Un literal a une valeur simple (nombre, texte ou booléen)." });
    if ((type === "parameter" || type === "formula") && !node.id) out.push({ path, code: "NO_ID", detail: `Un nœud ${type} a besoin d'un id.` });
    if (type === "reference" && (!node.reference?.objectKind || !node.reference?.objectId)) out.push({ path, code: "REFERENCE_UNSET", detail: "Une référence a besoin de reference.objectKind et reference.objectId." });
    if (type === "context" && !node.path) out.push({ path, code: "NO_PATH", detail: "Un nœud context a besoin d'un path." });
    return out;
  }
  const shape = SHAPES[type];
  if (!shape) return [{ path, code: "UNKNOWN_OPERATION", detail: `Type de nœud inconnu : ${JSON.stringify(type ?? "")}.` }];
  if (shape === "args" || shape === "duo") {
    if (!Array.isArray(node.args) || !node.args.length || (shape === "duo" && node.args.length !== 2)) out.push({ path, code: "ARGS", detail: `${type} prend une liste args${shape === "duo" ? " de deux nœuds" : ""}.` });
    else node.args.forEach((arg, i) => child(`args.${i}`, arg));
    return out;
  }
  for (const key of KEYS[shape]) child(key, node[key]);
  if (shape === "range" && !Array.isArray(node.ranges)) out.push({ path, code: "RANGES", detail: "rangeLookup a besoin de ranges." });
  if (shape === "table" && !Array.isArray(node.table)) out.push({ path, code: "TABLE", detail: "lookup a besoin de table." });
  return out;
}

/** Problems of the formula and condition answers of a path (list rows included), with the question's id in the path. */
export function checkExpressionAnswers(questions, answers, prefix = "") {
  const out = [];
  for (const question of questions ?? []) {
    const value = answers?.[question.id];
    if (value === undefined || value === null || value === "") continue;
    const at = prefix ? `${prefix}.${question.id}` : question.id;
    if (question.kind === "formula" || question.kind === "condition") out.push(...checkExpression(value, at));
    else if (question.kind === "list" && Array.isArray(value)) value.forEach((row, i) => out.push(...checkExpressionAnswers(question.fields, row, `${at}.${i}`)));
  }
  return out;
}

export const hasExpressionQuestion = questions => (questions ?? []).some(q => q.kind === "formula" || q.kind === "condition" || (q.kind === "list" && hasExpressionQuestion(q.fields)));
