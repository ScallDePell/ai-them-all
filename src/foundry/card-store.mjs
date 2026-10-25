import { MODULE_ID } from "../core/constants.mjs";
import { normalizeCard } from "../core/cards.mjs";

const KEY = "cards";

/** Cards live in one world setting: the GM writes them, everyone may read them (they hold no secret). */
export function registerCardStore() {
  game.settings.register(MODULE_ID, KEY, { scope: "world", config: false, type: Array, default: [] });
}

export function readCards() {
  const raw = game.settings.get(MODULE_ID, KEY);
  return (Array.isArray(raw) ? raw : []).map(normalizeCard).filter(card => card.id);
}

export async function writeCards(cards) {
  await game.settings.set(MODULE_ID, KEY, cards.map(normalizeCard));
  game.ruleThemAll?.integrations?.refreshConfigurator?.();
}

export async function changeCards(change) {
  await writeCards(change(readCards()));
}
