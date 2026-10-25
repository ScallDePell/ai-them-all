# AI Them'All

Module **Foundry VTT** de génération de texte et d'images par IA, pensé pour les tables de jeu de rôle : portraits de personnages, images d'objets ou de pouvoirs, descriptions, éléments d'histoire… directement depuis les feuilles d'Actor et d'Item.

AI Them'All (ATA) fonctionne **seul**, sur n'importe quel système de jeu. Lorsque le module [Rule Them'All](https://github.com/ScallDePell/Rule-Them-All) (RTA) est actif, il s'y **intègre de façon optionnelle** au travers de l'API d'intégration générique de RTA, sans dépendance obligatoire dans un sens comme dans l'autre.

> **Statut : en conception.** Ce dépôt démarre à partir de la *Spécification technique d'interconnexion RTA* v1.0 (21/10/2026). Les interfaces décrites ici sont des contrats à implémenter, pas encore du code livré.

---

## Fonctionnalités prévues

### Génération texte et image
- Génération de **texte** (descriptions, biographies, notes) et d'**images** (portrait, token, objet, pouvoir…).
- Prompt de la card, complément facultatif saisi au moment de la génération.
- **Images de référence** avec un rôle explicite : identité à préserver, style à évoquer, fond/décor à intégrer, image actuelle à éditer.
- Pour les images : choix de la résolution, du format, de la qualité et du **nombre de variantes** (1 à X selon les capacités réelles du modèle ; plusieurs appels orchestrés si le fournisseur ne produit qu'une image par appel).
- **Galerie de sélection** : agrandir, comparer à l'original, relancer, modifier les instructions, annuler. La cible n'est modifiée **qu'après validation explicite**.
- Conservation de la référence de l'original et journal d'opération minimal.

### Concepteur de règles (nouvelle fonction)
- Le MJ décrit une règle en français ; l'IA la traduit en **réponses aux parcours de l'assistant de Rule Them'All**, que l'assistant valide et prévisualise.
- **Rien n'est écrit sans l'aperçu et le clic du MJ** : passage obligé par `planAssistant` puis `applyAssistant` de l'API stable de RTA.
- Disponible uniquement quand Rule Them'All (API ≥ 1.1.0) est actif. Plan détaillé : [docs/CONSIGNES.md](docs/CONSIGNES.md).

### Cards de génération
Chaque type de génération est une **card** configurable et réutilisable (aucune n'est codée en dur ; exemples : *Image PJ*, *Description PJ*, *Image PNJ*, *Image Objet*, *Image Pouvoir*, *Description Pouvoir*). Une card regroupe :

| Rubrique | Contenu |
| --- | --- |
| Identité | ID stable, libellé, description, état actif, types de documents concernés, ordre |
| Destination | Champ cible typé (texte / texte riche / image), portée *instance* ou *définition* |
| Sources | 0..N sources ordonnées : champs, paramètres, observations narratives, contenus, image/nom du document |
| Instructions | Prompt, complément à l'exécution, politique compléter / réécrire / remplacer |
| Références visuelles | Identité, inspiration, fond, image actuelle, avec priorité |
| Exécution | Agent, profil, modèle, héritage ou surcharge des paramètres |
| Présentation et droits | Icône sur le champ, utilisateurs autorisés, mode verrouillé/déverrouillé |
| Validation | Aperçu, confirmation, conservation de l'original, reprise sur erreur |

Une petite **icône de génération** apparaît sur les champs éligibles et autorisés. Si plusieurs cards ciblent le même champ, un sélecteur de recettes s'ouvre.

### Paramètres du monde
Une entrée **AI Them'All** dans les paramètres du monde Foundry ouvre une application dédiée :

| Onglet | Contenu |
| --- | --- |
| Agents | Plusieurs agents nommés : OpenAI, Ollama, API compatible OpenAI, futurs adaptateurs ; endpoint, authentification, test de connectivité |
| Modèles | Modèles texte et image par agent, découverte automatique quand c'est possible, capacités déclarées/vérifiées |
| Sorties image | Résolutions, formats, transparence, nombre de variantes (filtrés selon le modèle) |
| Profils | Profils réutilisables (Rapide, Qualité, Privé local, Coût réduit…) |
| Sécurité | Politique cloud/local, sources privées, secrets du MJ, confirmation d'envoi, journalisation limitée |

---

## Deux modes de fonctionnement

### Mode autonome (sans Rule Them'All)
- ATA enregistre ses propres menus de configuration, ses cards globales et des **adaptateurs de documents Foundry natifs**.
- Action par clic droit sur l'image ou un champ texte d'une feuille déverrouillée, dès que le document et le chemin de stockage sont détectables et éditables.
- Sélection avancée de la destination pour les systèmes tiers ; les champs dérivés ou éditeurs propriétaires peuvent demander un adaptateur spécifique.
- Aucune écriture aveugle dans le DOM.

### Mode intégré (avec Rule Them'All)
Quand RTA est actif et expose une API d'intégration compatible, ATA :
- ajoute une entrée **Systèmes → AI Them'All**, juste après « Feuilles », dans le configurateur RTA ;
- affiche ses cards avec la **présentation native** des cards RTA (tuiles/lignes, tags, Créer, clic droit), filtrées par Ruleset ; leur persistance reste dans ATA ;
- cible les **vrais champs** des feuilles RTA (nœuds de layout identifiés par une référence stable), pas des nœuds HTML ;
- lit les sources (y compris les **observations narratives** : les mots de l'échelle de description, jamais le nombre) en respectant Permissions, `seenBy` et `visibleIf` ;
- écrit les cibles via les services RTA (transactions, journal, relais MJ) après validation côté service ;
- place son icône dans l'emplacement d'action que RTA rend lui-même sur chaque champ compatible.

---

## Interconnexion avec Rule Them'All

Le couplage repose sur l'API générique `game.ruleThemAll.integrations` (prévue pour RTA 1.1.0). RTA ne connaît pas ATA : il expose des points d'extension utilisables par n'importe quel module compagnon.

### Détection et négociation
```js
// Enregistrement au "setup" de Foundry, quel que soit l'ordre de chargement des modules
Hooks.on("ruleThemAllRegisterIntegrations", integrations => registerWithRTA(integrations));

// Filet de sécurité au "ready" (l'enregistrement est idempotent)
Hooks.once("ready", () => {
  const integrations = game.ruleThemAll?.integrations;
  if (integrations) registerWithRTA(integrations);
});

function registerWithRTA(integrations) {
  const compatible = integrations.apiVersion?.split(".")[0] === "1"
    && REQUIRED_CAPABILITIES.every(c => integrations.capabilities.includes(c));
  if (!compatible) return reportStandaloneFallback(integrations); // diagnostic visible, mode autonome conservé
  // registerConfiguratorSection, registerSheetFieldAction, onRulesetChange…
}
```

### Points d'extension utilisés

| Besoin ATA | API RTA |
| --- | --- |
| Entrée de navigation + cards hébergées | `registerConfiguratorSection({ parentGroup: "systems", after: "sheetDefinitions", cards })` |
| Découverte des feuilles et des champs ciblables | `listSheetDefinitions`, `listBindableFields`, `describeField` |
| Lecture des sources | `listSourceCandidates`, `resolveSource` |
| Écriture des cibles | `validateTarget`, `updateTarget` (avec `expectedCurrent` pour éviter tout écrasement) |
| Icône sur les champs de feuille | `registerSheetFieldAction` |
| Champs supprimés ou modifiés | `onRulesetChange` / hook `ruleThemAllRulesetChanged` |

Un champ est désigné par une référence stable :
```js
{ rulesetId, sheetId, target: "actor" | "item", contentTypeId?, nodeId? | slot?: "header.img" | "header.name" }
```
Si le champ disparaît ou change de type, la card est marquée **invalide** avec une explication ; elle n'est jamais réaffectée silencieusement à un autre champ.

### Cycle de vie

| Situation | Résultat |
| --- | --- |
| ATA seul | Interface et génération autonomes |
| RTA seul | Aucune entrée ATA |
| RTA puis ATA, ou ATA puis RTA | Même intégration après rechargement |
| RTA désactivé | ATA conserve ses données et revient en autonome |
| RTA réactivé | Réintégration sans doublon de navigation ni de cards |
| API incompatible | Mode autonome conservé, diagnostic visible |

ATA ne déclare **aucune dépendance** à RTA dans son `module.json`.

---

## Sécurité et confidentialité
- Une génération ne modifie **jamais** de données mécaniques (caractéristiques, règles) : seules les cibles configurées, typées et autorisées sont modifiables.
- Un joueur ne peut ni lire un champ secret via une source IA, ni contourner un droit d'écriture ; les contrôles sont faits au traitement, pas seulement sur le bouton.
- Les secrets (clés d'API) ne sont jamais copiés dans les cards, les prompts enregistrés ou les journaux accessibles aux joueurs. Les settings Foundry n'étant pas un coffre-fort, un proxy/backend dédié est envisagé pour ne pas exposer de clés aux joueurs.
- Le MJ décide quels champs peuvent être envoyés à une IA cloud.
- Étapes séparées : lecture des sources, appel au fournisseur, upload du fichier, écriture du document, avec reprise ou annulation en cas d'erreur.
- Quotas, coûts, délais, annulation et limite de variantes explicites ; nettoyage configurable des images temporaires.

## Modèle de données (proposition)
- **Agent** (`id`, `provider`, `endpoint`, `credentialRef`, `models[]`, `capabilities`)
- **Model** (`id`, `agentId`, `modality`, `capabilities`)
- **Profile** (`id`, `defaults`)
- **GenerationCard** (`id`, `rulesetId?`, `documentTypes[]`, `targetRef`, `sourceRefs[]`, `prompt`, `visualRefs[]`, `overrides`, `permissions`, `enabled`)
- **GenerationRun** (`id`, `cardId`, `documentUuid`, `outputRefs[]`, `selectedRef?`, `status`)

---

## Feuille de route

| Lot | Contenu |
| --- | --- |
| RTA-1 | *(côté Rule Them'All)* Contrat générique d'extension : navigation, cards, champs, sources, cibles, actions de champs, cycle de vie |
| ATA-1 | Module autonome, registre des agents et modèles, génération texte/image, permissions |
| ATA-2 | Cards, cibles/sources et recettes, intégration au configurateur RTA, icônes sur les feuilles |
| ATA-3 | Images de référence/inspiration/fond, résolution et variantes, galerie et sauvegarde validée |
| ATA-4 | Adaptateurs pour systèmes tiers, profils avancés, historique, robustesse |
| RTA-2 | *(côté Rule Them'All)* Assistant dans l'API stable, hook de la fenêtre de l'assistant, description des parcours pour une machine (API 1.1.0) |
| ATA-R | **Concepteur de règles**, versions 0.1.0 à 0.5.0 puis recette : voir la [feuille de route de docs/CONSIGNES.md](docs/CONSIGNES.md#feuille-de-route-et-questions-ouvertes) |

## Compatibilité
- Foundry VTT **v14** (ApplicationV2, menus de paramètres, FilePicker), à vérifier en exécution.
- Rule Them'All **≥ 1.1.0** pour le mode intégré (API d'intégration `1.x`) ; facultatif.
