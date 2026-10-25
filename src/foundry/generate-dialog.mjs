import { MODULE_ID } from "../core/constants.mjs";
import { generateImages, generateText } from "../core/generation.mjs";
import { buildImagePrompt, buildTextPrompt, cleanText } from "../core/prompts.mjs";
import { resolveServices } from "../core/settings-schema.mjs";
import { esc, errorMessage, formGroup, options, t } from "./html.mjs";
import { readSettings } from "./settings.mjs";

const { ApplicationV2 } = foundry.applications.api;

const imageSrc = image => image.b64 ? `data:image/png;base64,${image.b64}` : image.url;

/** Puts a generated image in the world's folder and returns its path; a remote address that cannot be copied is kept. */
async function storeImage(image, document) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const dir = `worlds/${game.world.id}/${MODULE_ID}`;
  try { await FilePicker.createDirectory("data", dir, { notify: false }); } catch { /* it exists */ }
  let blob;
  try {
    blob = await (await fetch(imageSrc(image))).blob();
  } catch {
    return image.url;
  }
  const file = new File([blob], `${document.id}-${Date.now()}.png`, { type: blob.type || "image/png" });
  const result = await FilePicker.upload("data", dir, file, {}, { notify: false });
  if (!result?.path) throw new Error(t("Generate.UploadFailed"));
  return result.path;
}

/**
 * Generation for one field of a Rule Them'All sheet: choose a card, generate, look, then write. The field is written
 * only on Validate, through Rule Them'All's updateTarget, and refused if it changed since the window opened.
 */
export class GenerateDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "form",
    window: { title: "AITHEMALL.Generate.Title", icon: "fa-solid fa-wand-magic-sparkles", contentClasses: ["standard-form"] },
    position: { width: 620 },
    form: { handler: GenerateDialog.#onSubmit, closeOnSubmit: false },
    actions: { generate: GenerateDialog.#onGenerate, cancel: GenerateDialog.#onCancel }
  };

  #context;
  #cards;
  #cardId;
  #extra = "";
  #current;
  #checked = null;
  #result = null;
  #busy = false;
  #error = "";

  constructor(context, cards, options = {}) {
    super({ ...options, id: `${MODULE_ID}-generate-${context.document.id}` });
    this.#context = context;
    this.#cards = cards;
    this.#cardId = cards[0].id;
  }

  get #card() {
    return this.#cards.find(card => card.id === this.#cardId) ?? this.#cards[0];
  }

  get #integrations() {
    return game.ruleThemAll.integrations;
  }

  async _prepareContext(options) {
    if (!this.#checked) {
      this.#checked = await this.#integrations.validateTarget(this.#context, this.#context.fieldRef);
      if (this.#checked.allowed) this.#current = this.#checked.current;
      else this.#error = this.#checked.reason ?? this.#checked.code;
    }
    return super._prepareContext(options);
  }

  async _renderHTML() {
    const card = this.#card, allowed = this.#checked?.allowed;
    const cardChoice = this.#cards.length > 1
      ? formGroup("ata-gen-card", t("Generate.Card"), `<select id="ata-gen-card" name="cardId">${options(this.#cards.map(c => ({ value: c.id, label: c.name })), card.id)}</select>`)
      : `<p><strong>${esc(card.name)}</strong>${card.description ? ` · ${esc(card.description)}` : ""}</p>`;
    let result = "";
    if (this.#result?.text !== undefined) {
      result = formGroup("ata-gen-result", t("Generate.Result"), `<textarea id="ata-gen-result" name="result" rows="10">${esc(this.#result.text)}</textarea>`, t("Generate.ResultHint"));
    } else if (this.#result?.images) {
      result = `<div class="ata-variants">${this.#result.images.map((image, i) => `
        <label class="ata-variant"><input type="radio" name="choice" value="${i}"${i === 0 ? " checked" : ""}>
          <img src="${esc(imageSrc(image))}" alt="${esc(t("Generate.Variant", { n: i + 1 }))}"></label>`).join("")}</div>`;
      if (typeof this.#current === "string" && this.#current) result += `<p class="hint">${t("Generate.Original")}</p><img class="ata-original" src="${esc(this.#current)}" alt="">`;
    }
    return `
      ${cardChoice}
      ${formGroup("ata-gen-extra", t("Generate.Extra"), `<textarea id="ata-gen-extra" name="extra" rows="2">${esc(this.#extra)}</textarea>`)}
      ${this.#error ? `<p class="ata-status error">${esc(this.#error)}</p>` : ""}
      ${this.#busy ? `<p class="ata-status"><i class="fa-solid fa-spinner fa-spin"></i> ${t("Generate.Busy")}</p>` : ""}
      ${result}
      <footer class="form-footer">
        <button type="button" data-action="generate"${allowed && !this.#busy ? "" : " disabled"}>
          <i class="fa-solid fa-wand-magic-sparkles"></i> ${t(this.#result ? "Generate.Again" : "Generate.Generate")}
        </button>
        <button type="submit"${this.#result && !this.#busy ? "" : " disabled"}><i class="fa-solid fa-check"></i> ${t("Generate.Validate")}</button>
        <button type="button" data-action="cancel"><i class="fa-solid fa-xmark"></i> ${t("Generate.Cancel")}</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  #keepForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    if (data.cardId && data.cardId !== this.#cardId) { this.#cardId = data.cardId; this.#result = null; }
    this.#extra = data.extra ?? this.#extra;
    if (this.#result?.text !== undefined && typeof data.result === "string") this.#result.text = data.result;
    return data;
  }

  static async #onGenerate() {
    this.#keepForm();
    const card = this.#card, { field, document } = this.#context;
    const services = resolveServices(readSettings());
    this.#busy = true;
    this.#error = "";
    await this.render();
    try {
      if (card.kind === "image") {
        const prompt = buildImagePrompt({ card, documentName: document.name, extra: this.#extra });
        this.#result = { images: await generateImages(services.image, { prompt, count: card.variants }) };
      } else {
        const nameOnly = field.storage === "documentName";
        const request = buildTextPrompt({ card, documentName: document.name, fieldLabel: field.label ?? "", current: typeof this.#current === "string" ? this.#current : "",
          extra: this.#extra, valueKind: field.valueKind, nameOnly });
        this.#result = { text: cleanText(await generateText(services.text, request), { nameOnly }) };
      }
    } catch (error) {
      this.#error = errorMessage(error);
    }
    this.#busy = false;
    this.render();
  }

  static #onCancel() {
    this.close();
  }

  static async #onSubmit() {
    const data = this.#keepForm();
    if (!this.#result) return;
    this.#busy = true;
    await this.render();
    try {
      const value = this.#result.images
        ? await storeImage(this.#result.images[Number(data.choice ?? 0)] ?? this.#result.images[0], this.#context.document)
        : this.#result.text;
      const written = await this.#integrations.updateTarget(this.#context, this.#context.fieldRef, value, { expectedCurrent: this.#current });
      if (!written.ok) throw new Error(written.code === "CONFLICT" ? t("Generate.Conflict") : written.reason ?? written.code);
      ui.notifications.info(t(written.draftOnly ? "Generate.WrittenDraft" : "Generate.Written"));
      this.close();
    } catch (error) {
      this.#busy = false;
      this.#error = errorMessage(error);
      this.render();
    }
  }
}
