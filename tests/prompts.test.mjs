import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTextPrompt, cleanText } from "../src/core/prompts.mjs";

const card = { prompt: "Décris ce personnage.", useCurrent: false };

test("the current value is sent only when the card asks for it", () => {
  assert.ok(!buildTextPrompt({ card, current: "SECRET" }).prompt.includes("SECRET"));
  assert.ok(buildTextPrompt({ card: { ...card, useCurrent: true }, current: "Base" }).prompt.includes("Base"));
});

test("rich text asks for simple HTML, a name for one line", () => {
  assert.match(buildTextPrompt({ card, valueKind: "richText" }).system, /HTML/);
  assert.match(buildTextPrompt({ card, nameOnly: true }).system, /nom/);
});

test("answers lose their fences and quotes", () => {
  assert.equal(cleanText("```\nBonjour\n```"), "Bonjour");
  assert.equal(cleanText("« Aldric »\nsuite", { nameOnly: true }), "Aldric");
  assert.equal(cleanText("« Aldric »"), "Aldric");
});
