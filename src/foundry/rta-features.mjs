import { MODULE_ID } from "../core/constants.mjs";
import { cardsForField, cardsOfRuleset, duplicateCard, newCard, removeCard, reorderCards, setCardEnabled, upsertCard } from "../core/cards.mjs";
import { openCardEditor } from "./card-editor.mjs";
import { changeCards, readCards } from "./card-store.mjs";
import { GenerateDialog } from "./generate-dialog.mjs";
import { t } from "./html.mjs";
import { renderRulesPanel } from "./rules-panel.mjs";

const ids = {
  section: `${MODULE_ID}.generation`,
  action: `${MODULE_ID}.generate`,
  panel: `${MODULE_ID}.rules-designer`
};

async function cardRows(integrations, context) {
  const rows = [];
  for (const card of cardsOfRuleset(readCards(), context.rulesetId)) {
    let invalid = null;
    if (card.target) {
      const field = await integrations.describeField(card.target, { versionId: context.versionId, source: "draft" }).catch(() => null);
      if (field?.status !== "ok") invalid = { message: t("Card.Invalid") };
    }
    rows.push({
      id: card.id, name: card.name || t(`Card.Kinds.${card.kind}`), description: card.description, enabled: card.enabled, order: card.order,
      badges: [{ icon: card.kind === "image" ? "fa-solid fa-image" : "fa-solid fa-align-left", label: t(`Card.Kinds.${card.kind}`) }],
      ...(invalid ? { invalid } : {})
    });
  }
  return rows;
}

function generationSection(integrations) {
  return {
    id: ids.section,
    ownerModule: MODULE_ID,
    parentGroup: "systems",
    after: "sheetDefinitions",
    title: "AITHEMALL.Section.Title",
    icon: "fa-solid fa-robot",
    cards: {
      list: context => cardRows(integrations, context),
      create: async context => {
        const id = foundry.utils.randomID();
        await changeCards(cards => upsertCard(cards, newCard({ id, rulesetId: context.rulesetId, name: t("Card.NewName") }, cards)));
        openCardEditor(id, context);
      },
      open: async (id, context) => openCardEditor(id, context),
      duplicate: (id, context) => changeCards(cards => duplicateCard(cards, id, foundry.utils.randomID(), t("Card.CopySuffix"))),
      setEnabled: (id, enabled) => changeCards(cards => setCardEnabled(cards, id, enabled)),
      remove: id => changeCards(cards => removeCard(cards, id)),
      reorder: (orderedIds, context) => changeCards(cards => reorderCards(cards, orderedIds, context.rulesetId)),
      canMutate: context => context.user?.isGM === true
    }
  };
}

const fieldAction = {
  id: ids.action,
  ownerModule: MODULE_ID,
  icon: "fa-solid fa-wand-magic-sparkles",
  label: "AITHEMALL.Generate.Action",
  // The API keys live in the GM's browser: only the GM can generate.
  isVisible: context => context.user?.isGM === true && context.editable !== false,
  matches: (field, context) => cardsForField(readCards(), field, context.rulesetId).length > 0,
  execute: context => new GenerateDialog(context, cardsForField(readCards(), context.field, context.rulesetId)).render({ force: true })
};

const rulesPanel = {
  id: ids.panel,
  ownerModule: MODULE_ID,
  title: "AITHEMALL.Designer.Title",
  icon: "fa-solid fa-wand-magic-sparkles",
  isVisible: context => context.user?.isGM === true,
  render: renderRulesPanel
};

/** Registers what this version of Rule Them'All can host; each feature needs its own capabilities. Idempotent. */
export function registerRtaFeatures(integrations, capabilities) {
  const has = (...names) => names.every(name => capabilities.includes(name));
  const registered = [];
  if (has("configuratorSections", "cardHost")) { integrations.registerConfiguratorSection(generationSection(integrations)); registered.push("configuratorSection"); }
  if (has("sheetFieldActions", "fieldTargets")) { integrations.registerSheetFieldAction(fieldAction); registered.push("sheetFieldAction"); }
  if (has("assistantPanels")) { integrations.registerAssistantPanel(rulesPanel); registered.push("assistantPanel"); }
  return registered;
}
