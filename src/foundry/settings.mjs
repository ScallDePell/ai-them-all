import { MODULE_ID } from "../core/constants.mjs";
import { SETTINGS } from "../core/settings-schema.mjs";
import { ProviderConfig } from "./provider-config.mjs";

export function registerSettings() {
  for (const { key, ...data } of SETTINGS) game.settings.register(MODULE_ID, key, data);
  game.settings.registerMenu(MODULE_ID, "providerConfig", {
    name: "AITHEMALL.Provider.MenuName",
    label: "AITHEMALL.Provider.MenuLabel",
    hint: "AITHEMALL.Provider.MenuHint",
    icon: "fa-solid fa-robot",
    type: ProviderConfig,
    restricted: true
  });
}

export function readSettings() {
  return Object.fromEntries(SETTINGS.map(({ key }) => [key, game.settings.get(MODULE_ID, key)]));
}
