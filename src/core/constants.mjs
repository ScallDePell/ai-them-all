export const MODULE_ID = "ai-them-all";

export const PROVIDERS = Object.freeze({
  NONE: "none",
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  OLLAMA: "ollama"
});

/** Endpoint used when the GM leaves the endpoint setting empty. */
export const DEFAULT_ENDPOINTS = Object.freeze({
  [PROVIDERS.ANTHROPIC]: "https://api.anthropic.com",
  [PROVIDERS.OPENAI]: "https://api.openai.com/v1",
  [PROVIDERS.OLLAMA]: "http://localhost:11434"
});

/** Providers that cannot be called without the GM's API key. */
export const KEYED_PROVIDERS = Object.freeze([PROVIDERS.ANTHROPIC, PROVIDERS.OPENAI]);

export const RTA_MODULE_ID = "rule-them-all";
export const RTA_REGISTER_HOOK = "ruleThemAllRegisterIntegrations";
export const RTA_SUPPORTED_MAJOR = 1;
