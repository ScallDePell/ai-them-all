/* Generation cards: what to generate (text or image), with which instructions, for which field. AI Them'All owns
   them; with Rule Them'All they are shown in its configurator and offered on the fields of its sheets.
   Pure: lists of plain objects in, new lists out. */

export const CARD_KINDS = Object.freeze(["text", "image"]);

const text = value => typeof value === "string" ? value : "";

/** The kind of card a field takes: text and rich text take text cards, images take image cards. */
export function fieldKind(field) {
  if (field?.valueKind === "image") return "image";
  if (field?.valueKind === "text" || field?.valueKind === "richText") return "text";
  return null;
}

/** Same field: same sheet, same target and the same node or slot. */
export function sameFieldRef(a, b) {
  if (!a || !b) return false;
  return a.rulesetId === b.rulesetId && a.sheetId === b.sheetId && (a.target ?? "actor") === (b.target ?? "actor")
    && (a.contentTypeId ?? null) === (b.contentTypeId ?? null) && (a.nodeId ?? null) === (b.nodeId ?? null) && (a.slot ?? null) === (b.slot ?? null);
}

export function normalizeCard(raw = {}) {
  const kind = CARD_KINDS.includes(raw.kind) ? raw.kind : "text";
  const target = raw.target && typeof raw.target === "object" && raw.target.sheetId ? { ...raw.target } : null;
  return {
    id: text(raw.id),
    rulesetId: text(raw.rulesetId) || null,
    name: text(raw.name).trim(),
    description: text(raw.description),
    kind,
    enabled: raw.enabled !== false,
    order: Number.isFinite(raw.order) ? raw.order : 0,
    prompt: text(raw.prompt),
    useCurrent: raw.useCurrent === true,
    variants: kind === "image" ? Math.max(1, Math.min(4, Math.trunc(Number(raw.variants) || 1))) : 1,
    target
  };
}

export const cardsOfRuleset = (cards, rulesetId) => cards.filter(card => card.rulesetId === rulesetId);

export function newCard({ id, rulesetId = null, kind = "text", name = "" }, cards = []) {
  const order = Math.max(-1, ...cardsOfRuleset(cards, rulesetId).map(card => card.order)) + 1;
  return normalizeCard({ id, rulesetId, kind, name, order });
}

export function upsertCard(cards, card) {
  const next = normalizeCard(card);
  return cards.some(c => c.id === next.id) ? cards.map(c => c.id === next.id ? next : c) : [...cards, next];
}

export function duplicateCard(cards, id, newId, suffix = "") {
  const source = cards.find(card => card.id === id);
  if (!source) return cards;
  const copy = { ...source, id: newId, name: `${source.name}${suffix}`, order: source.order + 0.5 };
  return reorderCards([...cards, normalizeCard(copy)], null, source.rulesetId);
}

export const removeCard = (cards, id) => cards.filter(card => card.id !== id);

export const setCardEnabled = (cards, id, enabled) => cards.map(card => card.id === id ? { ...card, enabled: Boolean(enabled) } : card);

/** Gives the cards of a Ruleset the order of orderedIds (or their current order), numbered from 0. */
export function reorderCards(cards, orderedIds, rulesetId) {
  const own = cardsOfRuleset(cards, rulesetId).sort((a, b) => a.order - b.order);
  const ids = orderedIds ? [...orderedIds, ...own.map(c => c.id).filter(id => !orderedIds.includes(id))] : own.map(c => c.id);
  const order = new Map(ids.map((id, i) => [id, i]));
  return cards.map(card => card.rulesetId === rulesetId && order.has(card.id) ? { ...card, order: order.get(card.id) } : card);
}

/** The enabled cards of the field's Ruleset that may fill it: same kind, and the same field when the card names one. */
export function cardsForField(cards, field, rulesetId) {
  const kind = fieldKind(field);
  if (!kind || field?.writable === false) return [];
  return cardsOfRuleset(cards, rulesetId)
    .filter(card => card.enabled && card.kind === kind && (!card.target || sameFieldRef(card.target, field.ref)))
    .sort((a, b) => a.order - b.order);
}
