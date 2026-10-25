import { DEFAULT_ENDPOINTS, MODULE_ID, PROVIDERS } from "../core/constants.mjs";
import { listModels } from "../core/model-catalog.mjs";
import { SETTINGS } from "../core/settings-schema.mjs";
import { readSettings } from "./settings.mjs";

const { ApplicationV2 } = foundry.applications.api;
const t = (key, data) => data ? game.i18n.format(`AITHEMALL.Provider.${key}`, data) : game.i18n.localize(`AITHEMALL.Provider.${key}`);
const s = (setting, part) => game.i18n.localize(`AITHEMALL.Settings.${setting}.${part}`);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

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

/** GM window: provider, endpoint, key, connection test, then model choice from what the service lists. */
export class ProviderConfig extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-provider`,
    tag: "form",
    window: { title: "AITHEMALL.Provider.Title", icon: "fa-solid fa-robot", contentClasses: ["standard-form"] },
    position: { width: 560 },
    form: { handler: ProviderConfig.#onSubmit, closeOnSubmit: true },
    actions: { testConnection: ProviderConfig.#onTest }
  };

  /** Values typed but not saved yet, kept across re-renders. */
  #draft = null;
  /** { text, image } once a connection test succeeded. */
  #models = null;
  #status = null;

  async _renderHTML() {
    const values = this.#draft ?? readSettings();
    const provider = values.provider;
    const providerOptions = Object.values(PROVIDERS)
      .map(p => `<option value="${p}"${p === provider ? " selected" : ""}>${s("provider", `Choices.${p}`)}</option>`).join("");
    const hasProvider = provider in DEFAULT_ENDPOINTS;
    const status = this.#status
      ? `<p class="ata-status ${this.#status.ok ? "success" : "error"}">${esc(this.#status.message)}</p>` : "";
    const textInput = this.#models
      ? modelSelect("textModel", this.#models.text, values.textModel, false)
      : `<input id="ata-textModel" type="text" name="textModel" value="${esc(values.textModel)}">`;
    const imageInput = this.#models
      ? modelSelect("imageModel", this.#models.image, values.imageModel, true)
      : `<input id="ata-imageModel" type="text" name="imageModel" value="${esc(values.imageModel)}">`;
    return `
      ${field("provider", `<select id="ata-provider" name="provider">${providerOptions}</select>`)}
      ${field("endpoint", `<input id="ata-endpoint" type="text" name="endpoint" value="${esc(values.endpoint)}" placeholder="${esc(DEFAULT_ENDPOINTS[provider] ?? "")}"${hasProvider ? "" : " disabled"}>`)}
      ${field("apiKey", `<input id="ata-apiKey" type="password" name="apiKey" value="${esc(values.apiKey)}" autocomplete="off"${hasProvider ? "" : " disabled"}>`)}
      <div class="form-group">
        <button type="button" data-action="testConnection"${hasProvider ? "" : " disabled"}>
          <i class="fa-solid fa-plug"></i> ${t("Test")}
        </button>
      </div>
      ${status}
      ${this.#models ? "" : `<p class="hint">${t("TestFirst")}</p>`}
      ${field("textModel", textInput)}
      ${field("imageModel", imageInput)}
      ${this.#models && !this.#models.image.length ? `<p class="hint">${t("NoImageModels")}</p>` : ""}
      <footer class="form-footer">
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${t("Save")}</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[name=provider]")?.addEventListener("change", () => {
      this.#draft = this.#readForm();
      this.#models = null;
      this.#status = null;
      this.render();
    });
  }

  #readForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    return Object.fromEntries(SETTINGS.map(({ key }) => [key, data[key] ?? ""]));
  }

  static async #onTest() {
    this.#draft = this.#readForm();
    this.#status = { ok: true, message: t("Testing") };
    await this.render();
    try {
      this.#models = await listModels(this.#draft);
      this.#status = { ok: true, message: t("Connected", { text: this.#models.text.length, image: this.#models.image.length }) };
    } catch (error) {
      this.#models = null;
      this.#status = { ok: false, message: game.i18n.format(`AITHEMALL.Provider.Errors.${error.code ?? "network"}`, { detail: error.detail ?? "" }) };
    }
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    for (const { key } of SETTINGS) {
      if (key in data) await game.settings.set(MODULE_ID, key, data[key] ?? "");
    }
    // Inputs disabled for "none" are not submitted: clear them with the provider.
    if (data.provider === PROVIDERS.NONE) {
      for (const key of ["endpoint", "apiKey"]) await game.settings.set(MODULE_ID, key, "");
    }
  }
}
