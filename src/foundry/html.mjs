export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const t = (key, data) => data ? game.i18n.format(`AITHEMALL.${key}`, data) : game.i18n.localize(`AITHEMALL.${key}`);

export function formGroup(id, label, input, hint = "") {
  return `<div class="form-group">
    <label for="${id}">${esc(label)}</label>
    <div class="form-fields">${input}</div>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
  </div>`;
}

export const options = (items, selected) => items
  .map(({ value, label }) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`).join("");

/** A short message shown to the GM for an error from an AI service or from Rule Them'All. */
export function errorMessage(error) {
  if (error?.code) return game.i18n.format(`AITHEMALL.Provider.Errors.${error.code}`, { detail: error.detail ?? "" });
  return error?.message ?? String(error);
}
