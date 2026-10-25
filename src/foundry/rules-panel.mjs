import { MODULE_ID } from "../core/constants.mjs";
import { describeServiceStatus } from "../core/provider-status.mjs";
import { catalogSummary, fillStep, planSteps } from "../core/rules-designer.mjs";
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
 * The "Décris ta règle" panel in Rule Them'All's assistant. The AI splits the rule into steps, one path each; the
 * panel opens each step filled in the assistant, whose preview the GM checks before clicking Apply, then moves on.
 */
export function renderRulesPanel(element, assistant) {
  element.classList.add("ata-designer");
  element.innerHTML = `
    <p class="hint">${t("Designer.Intro")}</p>
    <textarea rows="4" data-ata-rule placeholder="${esc(t("Designer.Placeholder"))}"></textarea>
    <div class="ata-designer-actions"><button type="button" data-ata="propose"><i class="fa-solid fa-wand-magic-sparkles"></i> ${t("Designer.Propose")}</button></div>
    <ol class="ata-steps" data-ata-steps></ol>
    <div data-ata-status role="status"></div>
    <div class="ata-designer-actions" data-ata-next></div>`;
  const textarea = element.querySelector("[data-ata-rule]");
  const propose = element.querySelector("[data-ata=propose]");
  const stepsList = element.querySelector("[data-ata-steps]");
  const status = element.querySelector("[data-ata-status]");
  const next = element.querySelector("[data-ata-next]");
  const run = { description: "", steps: [], index: -1, done: [], last: null, busy: false, service: null, catalog: null };

  const show = (html, kind = "") => { status.innerHTML = html ? `<p class="ata-status ${kind}">${html}</p>` : ""; };
  const busy = text => show(`<i class="fa-solid fa-spinner fa-spin"></i> ${esc(text)}`);
  const button = (action, icon, label) => `<button type="button" data-ata="${action}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
  const drawSteps = () => {
    stepsList.innerHTML = run.steps.map((step, i) => {
      const mark = i < run.index ? "fa-check" : i === run.index ? "fa-arrow-right" : "fa-circle";
      return `<li class="${i === run.index ? "current" : ""}"><i class="fa-solid ${mark}"></i> ${esc(step.goal || step.pathId)}</li>`;
    }).join("");
  };
  const drawNext = buttons => { next.innerHTML = buttons.join(""); };
  const sync = state => {
    const readOnly = state?.readOnly || !game.user.isGM;
    for (const control of element.querySelectorAll("button[data-ata]")) control.disabled = readOnly || run.busy;
    if (readOnly && !status.innerHTML) show(t(game.user.isGM ? "Designer.ReadOnly" : "Designer.GMOnly"));
  };
  const stop = assistant.onChange(sync);
  sync(assistant.state());

  const generate = request => generateText(run.service, { ...request, maxTokens: 4096 });

  async function prepare(index) {
    run.index = index;
    run.last = null;
    drawSteps();
    drawNext([]);
    const step = run.steps[index];
    const result = await fillStep({
      description: run.description, step, done: run.done, catalog: run.catalog, generate,
      describePath: (pathId, answers) => assistant.describePath(pathId, answers),
      plan: (pathId, answers) => assistant.plan(pathId, answers),
      onAttempt: attempt => busy(t(attempt ? "Designer.Retrying" : "Designer.Filling", { attempt, n: index + 1, total: run.steps.length }))
    });
    const last = index === run.steps.length - 1;
    const onward = last ? [] : [button("next", "fa-forward-step", t("Designer.Next"))];
    if (result.status === "planned") {
      run.last = result;
      await assistant.openPath(result.pathId, result.answers);
      show(`${esc(result.explanation)} ${esc(t(last ? "Designer.ReviewLast" : "Designer.Review"))}`, "success");
      drawNext(onward);
    } else if (result.status === "question") {
      show(`${esc(t("Designer.Question"))} ${esc(result.question)}`);
      drawNext([button("retry", "fa-rotate", t("Designer.Retry")), ...onward]);
    } else {
      await assistant.openPath(result.pathId, result.answers);
      show(`${esc(t("Designer.Invalid"))} ${esc(result.errors.map(e => e.detail ?? e.code).join(" · "))}`, "error");
      drawNext([button("retry", "fa-rotate", t("Designer.Retry")), ...onward]);
    }
  }

  async function start() {
    const description = textarea.value.trim();
    if (!description) return show(t("Designer.Empty"), "error");
    run.service = resolveServices(readSettings()).text;
    const ready = describeServiceStatus(run.service, "text");
    if (!ready.ready) return show(ready.issues.map(key => esc(game.i18n.localize(key))).join(" "), "error");
    run.catalog = await assistant.catalog();
    if (!await consent(description, catalogSummary(run.catalog))) return;
    Object.assign(run, { description, steps: [], index: -1, done: [], last: null });
    drawSteps();
    drawNext([]);
    busy(t("Designer.Choosing"));
    const result = await planSteps({ description, catalog: run.catalog, generate });
    if (result.status === "question") return show(`${esc(t("Designer.Question"))} ${esc(result.question)} ${esc(t("Designer.AnswerInText"))}`);
    if (result.status === "noPath") return show(`${esc(t("Designer.NoPath"))} ${esc(result.reason)}`, "error");
    run.steps = result.steps;
    await prepare(0);
  }

  element.addEventListener("click", async event => {
    const action = event.target.closest?.("button[data-ata]")?.dataset.ata;
    if (!action || run.busy) return;
    run.busy = true;
    sync(assistant.state());
    try {
      if (action === "propose") await start();
      else if (action === "retry") await prepare(run.index);
      else if (action === "next") {
        const step = run.steps[run.index];
        run.done.push({ pathId: step.pathId, goal: step.goal, created: run.last?.plan?.created ?? [] });
        await prepare(run.index + 1);
      }
    } catch (error) {
      show(esc(errorMessage(error)), "error");
    }
    run.busy = false;
    sync(assistant.state());
  });
  return stop;
}
