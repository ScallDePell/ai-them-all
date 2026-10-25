import { RTA_SUPPORTED_MAJOR } from "./constants.mjs";

/**
 * Decides whether AI Them'All can integrate with the Rule Them'All integrations API.
 * Anything unexpected keeps the standalone mode, with a reason for the diagnostic.
 * Some RTA builds expose capabilities without apiVersion: they are negotiated on capabilities alone.
 */
export function negotiateIntegration(integrations, requiredCapabilities = []) {
  if (!integrations) return { mode: "standalone", reason: "absent" };
  const apiVersion = typeof integrations.apiVersion === "string" ? integrations.apiVersion : null;
  const capabilities = Array.isArray(integrations.capabilities) ? integrations.capabilities : null;
  if (!apiVersion && !capabilities) return { mode: "standalone", reason: "notExposed" };
  if (apiVersion) {
    const major = Number.parseInt(apiVersion.split(".")[0], 10);
    if (major !== RTA_SUPPORTED_MAJOR) return { mode: "standalone", reason: "apiVersion", apiVersion };
  }
  if (!capabilities) return { mode: "standalone", reason: "capabilities", apiVersion, missing: [...requiredCapabilities] };
  const missing = requiredCapabilities.filter(c => !capabilities.includes(c));
  if (missing.length) return { mode: "standalone", reason: "capabilities", apiVersion, missing };
  return { mode: "integrated", apiVersion, unversioned: !apiVersion, capabilities: [...capabilities] };
}
