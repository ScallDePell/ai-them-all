import { MODULE_ID } from "../core/constants.mjs";
import { describeServiceStatus } from "../core/provider-status.mjs";
import { catalogSummary, designRule } from "../core/rules-designer.mjs";
import { generateText } from "../core/generation.mjs";
import { resolveServices } from "../core/settings-schema.mjs";
import { esc, errorMessage, t } from "./html.mjs";
import { readSettings } from "./settings.mjs";

const CONSENT = "designerConsent";

export function registerDesignerSettings() {
  game.settings.register(MODULE_ID, CONSENT, { scope: "client", config: false, type: Boolean, default: false });
}

/** Before the first sending from this browser, the GM sees what leaves the world. */
async function consent(description, summary) {
  if (game.settings.get(MODULE_ID, CONSENT)) return true;
  const content = `<p>${t("Designer.ConsentIntro")}</p>
    <ul><li>${t("Designer.ConsentText")}<blockquote>${esc(description)}</blockquote></li>
    <li>${t("Designer.ConsentCatalog", { count: summary.length })}</li>
    <li>${t("Designer.ConsentEntries")}</li></ul>
    <p>${t("Designer.ConsentNever")}</p>`;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Designer.ConsentTitle") }, content });
  if (ok) await game.settings.set(MODULE_ID, CONSENT, true);
  return ok;
}

/**
 * The "Décris ta règle" panel in Rule Them'All's assistant. The AI proposes the answers of one path; the assistant
 * shows them with its own preview, and only the GM's click on Apply writes the draft.
 */
export function renderRulesPanel(element, assistant) {
  element.classList.add("ata-designer");
  element.innerHTML = `
    <p class="hint">${t("Designer.Intro")}</p>
    <textarea rows="4" data-ata-rule placeholder="${esc(t("Designer.Placeholder"))}"></textarea>
    <div class="ata-designer-actions"><button type="button" data-ata-propose><i class="fa-solid fa-wand-magic-sparkles"></i> ${t("Designer.Propose")}</button></div>
    <div data-ata-status role="status"></div>`;
  const textarea = element.querySelector("[data-ata-rule]");
  const button = element.querySelector("[data-ata-propose]");
  const status = element.querySelector("[data-ata-status]");
  const show = (html, kind = "") => { status.innerHTML = html ? `<p class="ata-status ${kind}">${html}</p>` : ""; };
  const sync = state => {
    const readOnly = state?.readOnly || !game.user.isGM;
    button.disabled = readOnly || button.dataset.busy === "1";
    if (readOnly && !status.innerHTML) show(t(game.user.isGM ? "Designer.ReadOnly" : "Designer.GMOnly"));
  };
  const stop = assistant.onChange(sync);
  sync(assistant.state());

  button.addEventListener("click", async () => {
    const description = textarea.value.trim();
    if (!description) return show(t("Designer.Empty"), "error");
    const service = resolveServices(readSettings()).text;
    const ready = describeServiceStatus(service, "text");
    if (!ready.ready) return show(ready.issues.map(key => esc(game.i18n.localize(key))).join(" "), "error");
    let catalog;
    try { catalog = await assistant.catalog(); } catch (error) { return show(esc(errorMessage(error)), "error"); }
    if (!await consent(description, catalogSummary(catalog))) return;
    button.dataset.busy = "1";
    button.disabled = true;
    try {
      const result = await designRule({
        description, catalog,
        describePath: (pathId, answers) => assistant.describePath(pathId, answers),
        plan: (pathId, answers) => assistant.plan(pathId, answers),
        generate: request => generateText(service, { ...request, maxTokens: 4096 }),
        onStep: (step, attempt) => show(`<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t(step === "choose" ? "Designer.Choosing" : attempt ? "Designer.Retrying" : "Designer.Filling", { attempt }))}`)
      });
      if (result.status === "planned") {
        await assistant.openPath(result.pathId, result.answers);
        show(`${esc(result.explanation)} ${esc(t("Designer.Review"))}`, "success");
      } else if (result.status === "question") {
        show(`${esc(t("Designer.Question"))} ${esc(result.question)}`);
      } else if (result.status === "noPath") {
        show(`${esc(t("Designer.NoPath"))} ${esc(result.reason)}`, "error");
      } else {
        await assistant.openPath(result.pathId, result.answers);
        show(`${esc(t("Designer.Invalid"))} ${esc(result.errors.map(e => e.detail ?? e.code).join(" · "))}`, "error");
      }
    } catch (error) {
      show(esc(errorMessage(error)), "error");
    }
    delete button.dataset.busy;
    sync(assistant.state());
  });
  return stop;
}
