import { RTA_SUPPORTED_MAJOR } from "./constants.mjs";

/**
 * Decides whether AI Them'All can integrate with the Rule Them'All integrations API.
 * Anything unexpected keeps the standalone mode, with a reason for the diagnostic.
 */
export function negotiateIntegration(integrations, requiredCapabilities = []) {
  if (!integrations) return { mode: "standalone", reason: "absent" };
  const apiVersion = typeof integrations.apiVersion === "string" ? integrations.apiVersion : null;
  const major = Number.parseInt(apiVersion?.split(".")[0], 10);
  if (major !== RTA_SUPPORTED_MAJOR) return { mode: "standalone", reason: "apiVersion", apiVersion };
  const capabilities = Array.isArray(integrations.capabilities) ? integrations.capabilities : [];
  const missing = requiredCapabilities.filter(c => !capabilities.includes(c));
  if (missing.length) return { mode: "standalone", reason: "capabilities", apiVersion, missing };
  return { mode: "integrated", apiVersion, capabilities: [...capabilities] };
}
