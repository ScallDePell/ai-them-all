import { MODULE_ID } from "../core/constants.mjs";
import { CARD_KINDS, fieldKind, upsertCard } from "../core/cards.mjs";
import { changeCards, readCards } from "./card-store.mjs";
import { esc, formGroup, options, t } from "./html.mjs";

const { ApplicationV2 } = foundry.applications.api;

const SLOT_LABELS = { "header.img": "Card.Slot.headerImg", "header.name": "Card.Slot.headerName", "template.image": "Card.Slot.templateImage" };

/** The fields of the Ruleset's sheets a card may be bound to, from Rule Them'All's draft. */
async function bindableFields(integrations, { rulesetId, versionId }) {
  if (!integrations?.listSheetDefinitions) return [];
  const source = { versionId, source: "draft" };
  const out = [];
  for (const sheet of await integrations.listSheetDefinitions(rulesetId, source)) {
    if (sheet.enabled === false) continue;
    const sheetName = sheet.id === "auto" ? t(`Card.AutoSheet.${sheet.target}`) : sheet.id;
    for (const field of await integrations.listBindableFields(rulesetId, sheet.id, { ...source, target: sheet.target })) {
      if (!field.writable || field.inRepeater) continue;
      const what = field.ref.slot ? t(SLOT_LABELS[field.ref.slot]) : `${field.nodeKind}${field.label ? ` (${field.label})` : ""}`;
      out.push({ ref: field.ref, kind: fieldKind(field), label: `${sheetName} › ${what}` });
    }
  }
  return out;
}

/** Edits one generation card. Saving writes the card list and asks Rule Them'All to draw its configurator again. */
export class CardEditor extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "form",
    window: { title: "AITHEMALL.Card.EditorTitle", icon: "fa-solid fa-wand-magic-sparkles", contentClasses: ["standard-form"] },
    position: { width: 560 },
    form: { handler: CardEditor.#onSubmit, closeOnSubmit: true }
  };

  #card;
  #context;
  #fields = null;

  constructor(card, context = {}, options = {}) {
    super({ ...options, id: `${MODULE_ID}-card-${card.id}` });
    this.#card = { ...card };
    this.#context = context;
  }

  async _prepareContext(options) {
    this.#fields ??= await bindableFields(game.ruleThemAll?.integrations, this.#context).catch(() => []);
    return super._prepareContext(options);
  }

  async _renderHTML() {
    const card = this.#card;
    const targets = [{ value: "", label: t(`Card.AnyField.${card.kind}`) },
      ...this.#fields.filter(f => f.kind === card.kind).map(f => ({ value: JSON.stringify(f.ref), label: f.label }))];
    const currentTarget = card.target ? JSON.stringify(card.target) : "";
    if (currentTarget && !targets.some(o => o.value === currentTarget)) targets.push({ value: currentTarget, label: t("Card.MissingField") });
    return `
      ${formGroup("ata-card-name", t("Card.Name"), `<input id="ata-card-name" type="text" name="name" value="${esc(card.name)}" required>`)}
      ${formGroup("ata-card-kind", t("Card.Kind"), `<select id="ata-card-kind" name="kind">${options(CARD_KINDS.map(k => ({ value: k, label: t(`Card.Kinds.${k}`) })), card.kind)}</select>`)}
      ${formGroup("ata-card-target", t("Card.Target"), `<select id="ata-card-target" name="target">${options(targets, currentTarget)}</select>`, t("Card.TargetHint"))}
      ${formGroup("ata-card-prompt", t("Card.Prompt"), `<textarea id="ata-card-prompt" name="prompt" rows="6">${esc(card.prompt)}</textarea>`, t(`Card.PromptHint.${card.kind}`))}
      ${card.kind === "text"
        ? formGroup("ata-card-current", t("Card.UseCurrent"), `<input id="ata-card-current" type="checkbox" name="useCurrent"${card.useCurrent ? " checked" : ""}>`, t("Card.UseCurrentHint"))
        : formGroup("ata-card-variants", t("Card.Variants"), `<input id="ata-card-variants" type="number" name="variants" min="1" max="4" step="1" value="${card.variants}">`)}
      ${formGroup("ata-card-description", t("Card.Description"), `<input id="ata-card-description" type="text" name="description" value="${esc(card.description)}">`)}
      ${formGroup("ata-card-enabled", t("Card.Enabled"), `<input id="ata-card-enabled" type="checkbox" name="enabled"${card.enabled ? " checked" : ""}>`)}
      <footer class="form-footer">
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${t("Provider.Save")}</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[name=kind]")?.addEventListener("change", () => {
      this.#card = { ...this.#readForm(), target: null };
      this.render();
    });
  }

  #readForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    let target = null;
    try { target = data.target ? JSON.parse(data.target) : null; } catch { target = null; }
    return {
      ...this.#card,
      name: data.name ?? this.#card.name,
      kind: data.kind ?? this.#card.kind,
      prompt: data.prompt ?? "",
      description: data.description ?? "",
      useCurrent: Boolean(data.useCurrent),
      variants: Number(data.variants ?? this.#card.variants),
      enabled: Boolean(data.enabled),
      target
    };
  }

  static async #onSubmit() {
    const card = this.#readForm();
    if (!card.name.trim()) card.name = t(`Card.Kinds.${card.kind}`);
    await changeCards(cards => upsertCard(cards, card));
  }
}

export const openCardEditor = (id, context) => {
  const card = readCards().find(c => c.id === id);
  if (card) new CardEditor(card, context).render({ force: true });
};
