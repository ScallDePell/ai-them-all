import { test } from "node:test";
import assert from "node:assert/strict";
import { cardsForField, duplicateCard, fieldKind, newCard, normalizeCard, reorderCards, setCardEnabled, upsertCard } from "../src/core/cards.mjs";

const ref = { rulesetId: "rs", sheetId: "pc", target: "actor", slot: "header.img" };

test("text and rich text fields take text cards, images image cards", () => {
  assert.equal(fieldKind({ valueKind: "richText" }), "text");
  assert.equal(fieldKind({ valueKind: "image" }), "image");
  assert.equal(fieldKind({ valueKind: "number" }), null);
});

test("new cards go last in their Ruleset", () => {
  let cards = [];
  cards = upsertCard(cards, newCard({ id: "a", rulesetId: "rs" }, cards));
  cards = upsertCard(cards, newCard({ id: "b", rulesetId: "rs" }, cards));
  cards = upsertCard(cards, newCard({ id: "c", rulesetId: "other" }, cards));
  assert.deepEqual(cards.map(c => c.order), [0, 1, 0]);
});

test("a field gets the enabled cards of its Ruleset and kind, and the cards bound to it", () => {
  const cards = [
    normalizeCard({ id: "any", rulesetId: "rs", kind: "image" }),
    normalizeCard({ id: "bound", rulesetId: "rs", kind: "image", target: ref }),
    normalizeCard({ id: "elsewhere", rulesetId: "rs", kind: "image", target: { ...ref, slot: "template.image" } }),
    normalizeCard({ id: "off", rulesetId: "rs", kind: "image", enabled: false }),
    normalizeCard({ id: "text", rulesetId: "rs", kind: "text" }),
    normalizeCard({ id: "other", rulesetId: "x", kind: "image" })
  ];
  assert.deepEqual(cardsForField(cards, { valueKind: "image", writable: true, ref }, "rs").map(c => c.id), ["any", "bound"]);
  assert.deepEqual(cardsForField(cards, { valueKind: "image", writable: false, ref }, "rs"), []);
});

test("duplicate, disable and reorder keep a clean order", () => {
  let cards = [normalizeCard({ id: "a", rulesetId: "rs", order: 0, name: "A" }), normalizeCard({ id: "b", rulesetId: "rs", order: 1 })];
  cards = duplicateCard(cards, "a", "a2", " (copie)");
  assert.deepEqual([...cards].sort((x, y) => x.order - y.order).map(c => c.id), ["a", "a2", "b"]);
  assert.equal(cards.find(c => c.id === "a2").name, "A (copie)");
  cards = setCardEnabled(cards, "b", false);
  assert.equal(cards.find(c => c.id === "b").enabled, false);
  cards = reorderCards(cards, ["b", "a"], "rs");
  assert.deepEqual(Object.fromEntries(cards.map(c => [c.id, c.order])), { a: 1, a2: 2, b: 0 });
});

test("variants are bounded and only for images", () => {
  assert.equal(normalizeCard({ kind: "image", variants: 9 }).variants, 4);
  assert.equal(normalizeCard({ kind: "text", variants: 3 }).variants, 1);
});
