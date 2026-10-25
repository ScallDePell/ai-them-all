import { MODULE_ID } from "../core/constants.mjs";
import { SETTINGS } from "../core/settings-schema.mjs";

export function registerSettings() {
  for (const { key, ...data } of SETTINGS) game.settings.register(MODULE_ID, key, data);
}

export function readSettings() {
  return Object.fromEntries(SETTINGS.map(({ key }) => [key, game.settings.get(MODULE_ID, key)]));
}
