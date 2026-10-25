# Changelog

## 0.1.0

- Squelette du module Foundry VTT v14, sans dépendance à Rule Them'All.
- Réglages : fournisseur (Claude, API compatible OpenAI, Ollama), adresse, modèles texte et image ; clé API enregistrée dans le navigateur (portée client), jamais dans le monde.
- État de configuration consultable via `game.modules.get("ai-them-all").api.status()`, sans jamais exposer la clé.
- Détection optionnelle de Rule Them'All (API d'intégration 1.x) ; repli autonome avec diagnostic sinon.
- Tests Node et CI ; publication manuelle par `release.yml`.
