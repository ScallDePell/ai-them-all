# AI Them'All

Module **Foundry VTT** de génération de texte et d'images par IA, pensé pour les tables de jeu de rôle : portraits de personnages, images d'objets ou de pouvoirs, descriptions, éléments d'histoire… directement depuis les feuilles d'Actor et d'Item.

AI Them'All (ATA) fonctionne **seul**, sur n'importe quel système de jeu. Lorsque le module [Rule Them'All](https://github.com/ScallDePell/Rule-Them-All) (RTA) est actif, il s'y **intègre de façon optionnelle** au travers de l'API d'intégration générique de RTA, sans dépendance obligatoire dans un sens comme dans l'autre.

> **Statut : en développement.** Réglages des services texte et image, génération, cards et intégration à Rule Them'All (configurateur, champs des feuilles, concepteur de règles). Le mode autonome sans RTA n'offre pas encore de cards. Les interfaces décrites ici viennent de la *Spécification technique d'interconnexion RTA* v1.0 (21/10/2026) et restent des contrats à implémenter.

---

## Fonctionnalités prévues

### Génération texte et image
- Génération de **texte** (descriptions, biographies, notes) et d'**images** (portrait, token, objet, pouvoir…).
- Prompt de la card, complément facultatif saisi au moment de la génération.
- **Images de référence** avec un rôle explicite : identité à préserver, style à évoquer, fond/décor à intégrer, image actuelle à éditer.
- Pour les images : choix de la résolution, du format, de la qualité et du **nombre de variantes** (1 à X selon les capacités réelles du modèle ; plusieurs appels orchestrés si le fournisseur ne produit qu'une image par appel).
- **Galerie de sélection** : agrandir, comparer à l'original, relancer, modifier les instructions, annuler. La cible n'est modifiée **qu'après validation explicite**.
- Conservation de la référence de l'original et journal d'opération minimal.

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
- place son icône dans l'emplacement d'action que RTA rend lui-même sur chaque champ compatible ;
- propose un **concepteur de règles** dans l'assistant de Ruleset quand RTA expose l'API de l'assistant (API 1.1.0) : le MJ décrit une règle en français, l'IA remplit les parcours, l'assistant valide et montre l'aperçu, le MJ clique pour appliquer. Il peut aussi configurer un Modèle de Contenu existant (donner une action à une arme, régler ses champs) : le panneau montre les changements et les écrit par l'API stable du configurateur quand le MJ clique sur Appliquer au Contenu. L'IA n'écrit jamais directement dans un Ruleset.

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
| ATA-5 | Concepteur de règles dans l'assistant RTA (nécessite les lots RTA-J à L), actif seulement si RTA ≥ 1.1.0 est présent |

## Compatibilité
- Foundry VTT **v14** (ApplicationV2, menus de paramètres, FilePicker), à vérifier en exécution.
- Rule Them'All **≥ 1.1.0** pour le mode intégré (API d'intégration `1.x`) ; facultatif.

## Développement
- Tests : `npm test` (runner Node intégré, aucun appel réseau ; les réponses d'IA sont simulées).
- Publication : monter la version dans `module.json` (et l'URL `download`) et `CHANGELOG.md`, pousser sur `main`, lancer le workflow **Release** à la main. Après chaque mise à jour, Ctrl+F5 sur tous les clients.
