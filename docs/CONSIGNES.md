# Consignes du projet AI Them'All : concepteur de règles

*Document du 25/10/2026, Luca.*

AI Them'All est un module Foundry VTT v14 optionnel qui ajoute à l'assistant de Rule Them'All un concepteur de règles : le MJ décrit sa règle en français, une IA la traduit en parcours de l'assistant, et rien n'est écrit sans l'aperçu et le clic du MJ.

## Ce que fait le module, et ce qu'il ne fait pas

Le module traduit une règle décrite en mots en une suite de parcours de l'assistant, déjà remplis, que le MJ relit et applique un par un.

**Exemple :** « Rafale de 1, 2 ou 3 séquences de 3 balles, +2 si la séquence tient dans les attaques par round, −2 par séquence en trop, refusée s'il manque des balles » devient les six parcours du guide [Attaque en rafale graduée](https://claude.ai/artifact/54N41Qkanr1no68JVFrct2), chacun avec son aperçu.

| Il fait | Il ne fait pas |
| --- | --- |
| Choisir les parcours et remplir leurs réponses | Écrire ou modifier une entrée directement |
| Réutiliser les entrées du Ruleset ouvert (formules, paramètres, conditions, champs des Contenus) | Inventer une valeur de règle absente du texte du MJ : il la demande |
| Poser des questions quand la règle est ambiguë | Créer des Contenus (armes, objets) : hors de l'assistant |
| Expliquer chaque parcours proposé en une phrase | Publier le Ruleset |
| Signaler ce que l'assistant ne sait pas exprimer et proposer le Configurateur | Contourner une erreur de validation en forçant |

Quand une règle ne rentre dans aucun parcours, le module le dit et note le manque dans un journal que le MJ peut copier : c'est la liste des parcours à ajouter à Rule Them'All.

## Architecture et garde-fous

L'IA ne touche qu'à des réponses de parcours ; la validation, l'aperçu et l'écriture restent ceux de Rule Them'All.

**Chemin d'une règle décrite (8 étapes, 1 boucle d'essai) : aucune écriture dans le Ruleset avant le clic du MJ.**

1. **Le MJ décrit** sa règle en français.
2. **AI Them'All** prépare la requête : consigne fixe + catalogue des parcours.
3. **IA** : Claude ou Ollama.
4. **Réponses** de parcours (JSON).
5. **Validation** par `planAssistant`. Si elle échoue : nouvel essai à l'étape 3, deux au plus.
6. **Aperçu** de l'assistant.
7. **Clic du MJ** : `applyAssistant`.
8. **Brouillon** du Ruleset modifié.

Une réponse refusée par la validation repart vers l'IA avec l'erreur, deux fois au plus, puis le MJ voit l'erreur. Ce qui est envoyé à l'IA : le texte du MJ, la consigne fixe, le catalogue des parcours et la liste des entrées du Ruleset (identifiants et noms), jamais les fiches des personnages.

## Ce que Rule Them'All doit exposer d'abord

Trois ajouts dans Rule Them'All, sans rupture, faits dans le projet Rule Them'All avant le premier commit d'AI Them'All. L'API de l'assistant existe déjà dans le Configurateur (`src/configurator/configurator-graph.mjs`) ; elle n'est simplement pas dans le contrat stable.

| Ajout | Détail | Version |
| --- | --- | --- |
| Assistant dans `STABLE_API` | `listAssistantPaths`, `describeAssistantPath`, `assistantTextKeys`, `planAssistant`, `applyAssistant` (avec `baseFingerprint`) ; test de contrat étendu | API 1.1.0 |
| Hook de la fenêtre de l'assistant | Un module peut ajouter un panneau, ouvrir un parcours avec des réponses déjà remplies et lire l'aperçu ; Rule Them'All ne connaît pas l'IA | API 1.1.0 |
| Description des parcours pour une machine | Chaque parcours et chaque question avec son libellé, son type, ses choix et ce qu'il crée (`describeAssistantPath` le fait en partie) | API 1.1.0 |

Ce dernier point sert de « catalogue » envoyé à l'IA : si un parcours change dans Rule Them'All, le concepteur suit sans modification.

## Feuille de route et questions ouvertes

Chaque version se teste sans réseau, avec des réponses d'IA enregistrées.

1. **0.1.0, squelette :** module, dépendance à Rule Them'All (API 1.1.0 ou plus), réglages (fournisseur, clé client, modèle), panneau « Décris ta règle » vide dans l'assistant, CI.
2. **0.2.0, une règle, un parcours :** l'IA choisit un parcours et le remplit ; validation par `planAssistant`, aperçu, application au clic. Les erreurs de validation sont renvoyées à l'IA pour une seconde tentative, au plus deux.
3. **0.3.0, règles en plusieurs parcours :** une liste ordonnée de parcours, chacun appliqué avant de planifier le suivant (il réutilise ce que le précédent a créé).
4. **0.4.0, dialogue :** l'IA pose ses questions dans le panneau (valeurs manquantes, ambiguïtés) avant de proposer.
5. **0.5.0, modèle local :** fournisseur compatible Ollama, même panneau.
6. **Recette :** une dizaine de règles décrites en français (rafale, avantage, repos, état, coût en mana…) rejouées sur une copie de RWF 2.6.0 et comparées aux entrées attendues.

Questions ouvertes :

- [ ] Modèle Claude par défaut et plafond de dépense par requête.
- [ ] Le dépôt sera-t-il public, comme Rule Them'All, ou privé, comme RWF Tools ?
- [ ] Les joueurs de confiance peuvent-ils l'utiliser, ou le MJ seulement ?
