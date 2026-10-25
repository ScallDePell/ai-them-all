import { DEFAULT_ENDPOINTS, MODULE_ID, PROVIDERS } from "../core/constants.mjs";
import { listModels } from "../core/model-catalog.mjs";
import { IMAGE_PROVIDERS, SETTINGS, resolveServices } from "../core/settings-schema.mjs";
import { readSettings } from "./settings.mjs";

const { ApplicationV2 } = foundry.applications.api;
const t = (key, data) => data ? game.i18n.format(`AITHEMALL.Provider.${key}`, data) : game.i18n.localize(`AITHEMALL.Provider.${key}`);
const s = (setting, part) => game.i18n.localize(`AITHEMALL.Settings.${setting}.${part}`);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Setting names of each service's connection fields. */
const FIELDS = {
  text: { provider: "provider", endpoint: "endpoint", apiKey: "apiKey", model: "textModel" },
  image: { provider: "imageProvider", endpoint: "imageEndpoint", apiKey: "imageApiKey", model: "imageModel" }
};

function field(name, input) {
  return `<div class="form-group">
    <label for="ata-${name}">${s(name, "Name")}</label>
    <div class="form-fields">${input}</div>
    <p class="hint">${s(name, "Hint")}</p>
  </div>`;
}

function modelSelect(name, models, current, allowNone) {
  const options = models.map(m => `<option value="${esc(m.id)}"${m.id === current ? " selected" : ""}>${esc(m.label)}</option>`);
  if (current && !models.some(m => m.id === current)) {
    options.unshift(`<option value="${esc(current)}" selected>${esc(current)} (${t("NotListed")})</option>`);
  }
  if (allowNone) options.unshift(`<option value=""${current ? "" : " selected"}>${t("NoModel")}</option>`);
  return `<select id="ata-${name}" name="${name}">${options.join("")}</select>`;
}

function modelField(name, models, current, allowNone) {
  return field(name, models
    ? modelSelect(name, models, current, allowNone)
    : `<input id="ata-${name}" type="text" name="${name}" value="${esc(current)}">`);
}

/**
 * GM window: a text service and an image service (or the same one), each with its
 * connection test, then model choice from what the service lists.
 */
export class ProviderConfig extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-provider`,
    tag: "form",
    window: { title: "AITHEMALL.Provider.Title", icon: "fa-solid fa-robot", contentClasses: ["standard-form"] },
    position: { width: 580 },
    form: { handler: ProviderConfig.#onSubmit, closeOnSubmit: true },
    actions: { testConnection: ProviderConfig.#onTest }
  };

  /** Values typed but not saved yet, kept across re-renders. */
  #draft = null;
  /** Per service: { text, image } model lists once a connection test succeeded. */
  #models = { text: null, image: null };
  #status = { text: null, image: null };

  #connectionFields(kind, values) {
    const names = FIELDS[kind];
    const provider = values[names.provider];
    const providers = kind === "image" ? IMAGE_PROVIDERS : Object.values(PROVIDERS);
    const options = providers
      .map(p => `<option value="${p}"${p === provider ? " selected" : ""}>${s("provider", `Choices.${p}`)}</option>`).join("");
    const disabled = provider in DEFAULT_ENDPOINTS ? "" : " disabled";
    const status = this.#status[kind];
    return `
      ${field(names.provider, `<select id="ata-${names.provider}" name="${names.provider}" data-service="${kind}">${options}</select>`)}
      ${field(names.endpoint, `<input id="ata-${names.endpoint}" type="text" name="${names.endpoint}" value="${esc(values[names.endpoint])}" placeholder="${esc(DEFAULT_ENDPOINTS[provider] ?? "")}"${disabled}>`)}
      ${field(names.apiKey, `<input id="ata-${names.apiKey}" type="password" name="${names.apiKey}" value="${esc(values[names.apiKey])}" autocomplete="off"${disabled}>`)}
      <div class="form-group">
        <button type="button" data-action="testConnection" data-service="${kind}"${disabled}>
          <i class="fa-solid fa-plug"></i> ${t("Test")}
        </button>
      </div>
      ${status ? `<p class="ata-status ${status.ok ? "success" : "error"}">${esc(status.message)}</p>` : ""}`;
  }

  async _renderHTML() {
    const values = this.#draft ?? readSettings();
    const same = values.imageSameAsText !== false;
    // With a shared service, the image list comes from the text service's test.
    const imageModels = same ? this.#models.text?.image ?? null : this.#models.image?.image ?? null;
    const sharedWithoutImages = same && values.provider === PROVIDERS.ANTHROPIC;
    return `
      <fieldset>
        <legend>${t("TextSection")}</legend>
        ${this.#connectionFields("text", values)}
        ${this.#models.text ? "" : `<p class="hint">${t("TestFirst")}</p>`}
        ${modelField("textModel", this.#models.text?.text ?? null, values.textModel, false)}
      </fieldset>
      <fieldset>
        <legend>${t("ImageSection")}</legend>
        ${field("imageSameAsText", `<input id="ata-imageSameAsText" type="checkbox" name="imageSameAsText"${same ? " checked" : ""}>`)}
        <div class="ata-image-service"${same ? " hidden" : ""}>${this.#connectionFields("image", values)}</div>
        ${sharedWithoutImages ? `<p class="hint">${t("ClaudeNoImages")}</p>` : ""}
        ${modelField("imageModel", imageModels, values.imageModel, true)}
        ${imageModels && !imageModels.length && !sharedWithoutImages ? `<p class="hint">${t("NoImageModels")}</p>` : ""}
      </fieldset>
      <footer class="form-footer">
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${t("Save")}</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const select of this.element.querySelectorAll("select[data-service]")) {
      select.addEventListener("change", () => this.#reset(select.dataset.service));
    }
    this.element.querySelector("[name=imageSameAsText]")?.addEventListener("change", () => this.#reset(null));
  }

  /** A changed provider invalidates that service's test; the shared checkbox only re-renders. */
  #reset(kind) {
    this.#draft = this.#readForm();
    if (kind) {
      this.#models[kind] = null;
      this.#status[kind] = null;
    }
    this.render();
  }

  #readForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    return Object.fromEntries(SETTINGS.map(({ key, type }) => [key, data[key] ?? (type === Boolean ? false : "")]));
  }

  static async #onTest(event, target) {
    const kind = target.dataset.service;
    this.#draft = this.#readForm();
    const service = kind === "image"
      ? resolveServices({ ...this.#draft, imageSameAsText: false }).image
      : resolveServices(this.#draft).text;
    this.#status[kind] = { ok: true, message: t("Testing") };
    await this.render();
    try {
      const models = await listModels(service);
      this.#models[kind] = models;
      const message = kind === "image"
        ? t("ConnectedImage", { image: models.image.length })
        : t("Connected", { text: models.text.length, image: models.image.length });
      this.#status[kind] = { ok: true, message };
    } catch (error) {
      this.#models[kind] = null;
      this.#status[kind] = { ok: false, message: game.i18n.format(`AITHEMALL.Provider.Errors.${error.code ?? "network"}`, { detail: error.detail ?? "" }) };
    }
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    for (const { key, type } of SETTINGS) {
      if (type === Boolean) await game.settings.set(MODULE_ID, key, Boolean(data[key]));
      else if (key in data) await game.settings.set(MODULE_ID, key, data[key] ?? "");
    }
    // Inputs disabled for "none" are not submitted: clear them with the provider.
    for (const names of Object.values(FIELDS)) {
      if (data[names.provider] !== PROVIDERS.NONE) continue;
      for (const key of [names.endpoint, names.apiKey]) await game.settings.set(MODULE_ID, key, "");
    }
  }
}
