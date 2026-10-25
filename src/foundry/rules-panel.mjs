import { MODULE_ID } from "../core/constants.mjs";
import { describeServiceStatus } from "../core/provider-status.mjs";
import { catalogSummary, collectInventory, fillStep, listContentFields, planSteps } from "../core/rules-designer.mjs";
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
  const stepsList = element.querySelector("[data-ata-steps]");
  const status = element.querySelector("[data-ata-status]");
  const next = element.querySelector("[data-ata-next]");
  const run = { description: "", steps: [], index: -1, done: [], last: null, busy: false, service: null, catalog: null, inventory: [], contentFields: [], clarifications: [], pending: null };

  const show = (html, kind = "") => { status.innerHTML = html ? `<p class="ata-status ${kind}">${html}</p>` : ""; };
  const busy = text => show(`<i class="fa-solid fa-spinner fa-spin"></i> ${esc(text)}`);
  const button = (action, icon, label) => `<button type="button" data-ata="${action}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
  // Before the first step, the GM reviews the steps and may remove the ones not wanted.
  const drawSteps = () => {
    const reviewing = run.index < 0;
    stepsList.innerHTML = run.steps.map((step, i) => {
      const mark = step.skipped ? "fa-ban" : i < run.index ? "fa-check" : i === run.index ? "fa-arrow-right" : "fa-circle";
      const reuses = step.reuses?.length ? `<span class="hint"> · ${esc(t("Designer.Reuses"))} ${esc(step.reuses.join(", "))}</span>` : "";
      const remove = reviewing ? ` <button type="button" class="ata-icon" data-ata="remove" data-index="${i}" title="${esc(t("Designer.Remove"))}"><i class="fa-solid fa-xmark"></i></button>` : "";
      return `<li class="${i === run.index ? "current" : ""}${step.skipped ? " skipped" : ""}"><i class="fa-solid ${mark}"></i> <span>${esc(step.goal || step.pathId)}${reuses}</span>${remove}</li>`;
    }).join("");
  };
  const drawNext = buttons => { next.innerHTML = buttons.join(""); };
  // A question of the AI is answered here; the answer goes with every later request of this rule.
  const ask = (question, scope, buttons = []) => {
    run.pending = { question, scope };
    status.innerHTML = `<p class="ata-status">${esc(t("Designer.Question"))} ${esc(question)}</p>
      <textarea rows="2" data-ata-answer placeholder="${esc(t("Designer.AnswerPlaceholder"))}"></textarea>`;
    drawNext([button("answer", "fa-reply", t("Designer.Answer")), ...buttons]);
    status.querySelector("[data-ata-answer]")?.focus();
  };
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
      description: run.description, step, done: run.done, clarifications: run.clarifications, contentFields: run.contentFields, catalog: run.catalog, generate,
      describePath: (pathId, answers) => assistant.describePath(pathId, answers),
      plan: (pathId, answers) => assistant.plan(pathId, answers),
      onAttempt: attempt => busy(t(attempt ? "Designer.Retrying" : "Designer.Filling", { attempt, n: index + 1, total: run.steps.length }))
    });
    const last = index === run.steps.length - 1;
    const onward = last ? [] : [button("skip", "fa-ban", t("Designer.Skip")), button("next", "fa-forward-step", t("Designer.Next"))];
    if (result.status === "planned") {
      run.last = result;
      await assistant.openPath(result.pathId, result.answers);
      const toComplete = result.warnings.length ? ` ${esc(t("Designer.Warnings", { count: result.warnings.length }))}` : "";
      show(`${esc(result.explanation)} ${esc(t(last ? "Designer.ReviewLast" : "Designer.Review"))}${toComplete}`, result.warnings.length ? "" : "success");
      drawNext(onward);
    } else if (result.status === "question") {
      ask(result.question, "step", [button("retry", "fa-rotate", t("Designer.Retry")), ...onward]);
    } else {
      if (result.openable) await assistant.openPath(result.pathId, result.answers);
      show(`${esc(t(result.openable ? "Designer.Invalid" : "Designer.InvalidNotOpened"))} ${esc(result.errors.map(e => e.detail ?? e.code).join(" · "))}`, "error");
      drawNext([button("retry", "fa-rotate", t("Designer.Retry")), ...onward]);
    }
  }

  // The Content Types' fields, read through Rule Them'All's stable configurator API; none when it cannot say.
  function readContentFields() {
    try { return listContentFields(game.ruleThemAll?.configurator?.getRuleset?.(assistant.versionId)); } catch { return []; }
  }

  async function start() {
    const description = textarea.value.trim();
    if (!description) return show(t("Designer.Empty"), "error");
    run.service = resolveServices(readSettings()).text;
    const ready = describeServiceStatus(run.service, "text");
    if (!ready.ready) return show(ready.issues.map(key => esc(game.i18n.localize(key))).join(" "), "error");
    run.catalog = await assistant.catalog();
    if (!await consent(description, catalogSummary(run.catalog))) return;
    Object.assign(run, { description, steps: [], index: -1, done: [], last: null, clarifications: [], pending: null });
    busy(t("Designer.Inventory"));
    run.inventory = await collectInventory(run.catalog, (pathId, answers) => assistant.describePath(pathId, answers));
    run.contentFields = readContentFields();
    await split();
  }

  async function split() {
    run.steps = [];
    run.index = -1;
    drawSteps();
    drawNext([]);
    busy(t("Designer.Choosing", { count: run.inventory.length }));
    const result = await planSteps({ description: run.description, catalog: run.catalog, inventory: run.inventory, contentFields: run.contentFields, clarifications: run.clarifications, generate });
    if (result.status === "question") return ask(result.question, "steps");
    if (result.status === "noPath") return show(`${esc(t("Designer.NoPath"))} ${esc(result.reason)}`, "error");
    if (result.status === "unusable") return show(esc(t("Designer.Unusable", { reason: result.reason })), "error");
    run.steps = result.steps;
    drawSteps();
    show(`${esc(result.explanation)} ${esc(t("Designer.ReviewSteps"))}`);
    drawNext([button("begin", "fa-play", t("Designer.Begin"))]);
  }

  async function advance(skipped) {
    const step = run.steps[run.index];
    if (skipped) step.skipped = true;
    else run.done.push({ pathId: step.pathId, goal: step.goal, created: run.last?.plan?.created ?? [] });
    await prepare(run.index + 1);
  }

  element.addEventListener("click", async event => {
    const action = event.target.closest?.("button[data-ata]")?.dataset.ata;
    if (!action || run.busy) return;
    run.busy = true;
    sync(assistant.state());
    try {
      if (action === "propose") await start();
      else if (action === "remove") {
        run.steps.splice(Number(event.target.closest("button").dataset.index), 1);
        drawSteps();
        if (!run.steps.length) { drawNext([]); show(""); }
      }
      else if (action === "begin") await prepare(0);
      else if (action === "answer") {
        const answer = status.querySelector("[data-ata-answer]")?.value.trim();
        if (answer && run.pending) {
          run.clarifications.push({ question: run.pending.question, answer });
          const { scope } = run.pending;
          run.pending = null;
          if (scope === "steps") await split();
          else await prepare(run.index);
        }
      }
      else if (action === "retry") await prepare(run.index);
      else if (action === "next") await advance(false);
      else if (action === "skip") await advance(true);
    } catch (error) {
      show(esc(errorMessage(error)), "error");
    }
    run.busy = false;
    sync(assistant.state());
  });
  return stop;
}
