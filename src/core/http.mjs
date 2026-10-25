export class ConnectionError extends Error {
  /** @param {"noProvider"|"missingApiKey"|"network"|"auth"|"http"|"badResponse"|"noImageGeneration"} code */
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.code = code;
    this.detail = detail;
  }
}

export const trimSlash = url => url.replace(/\/+$/, "");

/** One JSON call to an AI service; every failure becomes a ConnectionError. */
export async function requestJson(fetchImpl, url, { method = "GET", headers = {}, body } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch (error) {
    throw new ConnectionError("network", error?.message ?? String(error));
  }
  if (response.status === 401 || response.status === 403) throw new ConnectionError("auth", String(response.status));
  if (!response.ok) {
    let detail = String(response.status);
    try {
      const error = (await response.json())?.error;
      if (error) detail += ` ${typeof error === "string" ? error : error.message ?? ""}`.trimEnd();
    } catch { /* the status is enough */ }
    throw new ConnectionError("http", detail);
  }
  try {
    return await response.json();
  } catch {
    throw new ConnectionError("badResponse");
  }
}
