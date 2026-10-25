/* What is sent to the AI for one field. Only the card's instructions, the GM's extra words, the Document's name and
   the field's current value when the card asks for it: never other fields of the sheet. */

const SYSTEM_TEXT = "Tu écris pour une table de jeu de rôle. Réponds uniquement avec le texte demandé, sans préambule, sans guillemets autour, dans la langue des instructions.";

export function buildTextPrompt({ card, documentName = "", fieldLabel = "", current = "", extra = "", valueKind = "text", nameOnly = false }) {
  const format = nameOnly
    ? "Donne seulement un nom, sur une ligne."
    : valueKind === "richText" ? "Mets en forme en HTML simple (<p>, <em>, <strong>, <ul>, <li>), sans autre balise." : "Texte brut, sans Markdown.";
  const lines = [
    card.prompt.trim(),
    extra.trim() && `Précisions du MJ : ${extra.trim()}`,
    documentName && `Document : ${documentName}`,
    fieldLabel && `Champ à remplir : ${fieldLabel}`,
    card.useCurrent && current && `Contenu actuel, à reprendre et améliorer :\n${current}`
  ].filter(Boolean);
  return { system: `${SYSTEM_TEXT} ${format}`, prompt: lines.join("\n\n") };
}

export function buildImagePrompt({ card, documentName = "", extra = "" }) {
  return [card.prompt.trim(), extra.trim(), documentName && `Sujet : ${documentName}`].filter(Boolean).join("\n");
}

/** Text answers sometimes come wrapped in quotes or a code fence. */
export function cleanText(text, { nameOnly = false } = {}) {
  let out = String(text ?? "").trim().replace(/^```[a-z]*\n?([\s\S]*?)\n?```$/i, "$1").trim();
  if (nameOnly) out = out.split("\n")[0].trim();
  if (/^["«“].*["»”]$/s.test(out)) out = out.slice(1, -1).trim();
  return out;
}
