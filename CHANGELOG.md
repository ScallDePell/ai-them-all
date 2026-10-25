# Changelog

## 0.2.6

- Concepteur de règles : pour découper la règle, l'IA voit ce que chaque parcours accepte (questions, types, entrées acceptées). Elle ne choisit plus un parcours incapable d'exprimer la règle (par exemple « Coût », qui ne dépense qu'une réserve de l'acteur d'une quantité fixe, pour des munitions d'arme dépendant du nombre de séquences).

## 0.2.5

- Concepteur de règles : quand l'IA pose une question, un champ **Répondre** apparaît dans le panneau ; la réponse est gardée pour toutes les étapes de la règle (plus besoin de réécrire la description).
- L'IA ne demande plus d'identifiant au MJ : elle le choisit et le réutilise d'une étape à l'autre.
- Grammaire des formules : les valeurs choisies au lancement d'une action se lisent par `variables.input.<id>` (ex. nombre de séquences d'une rafale).

## 0.2.4

- Concepteur de règles : une réponse de l'IA illisible ou citant des parcours inconnus (un titre au lieu d'un id) repart une fois vers l'IA avec la raison ; si elle reste inutilisable, le panneau dit pourquoi au lieu de « Aucun parcours ».
- L'IA est invitée à combiner plusieurs parcours (briques formule, condition, coût, action, test, attaque) avant de conclure qu'aucun ne convient.
- Ollama : contexte élargi (32k), le catalogue de l'assistant n'est plus tronqué.

## 0.2.3

- Concepteur de règles : l'IA reçoit la grammaire exacte des formules et conditions de Rule Them'All (nœuds, références à une définition, résultat du test en cours : `variables.test.margin`, DD…).
- Une formule mal formée (opération vide ou inconnue, référence sans cible) est renvoyée à l'IA avant d'atteindre l'assistant, et n'est jamais ouverte dans son formulaire (elle le faisait planter à l'application).
- Les points « à compléter avant de publier » de l'aperçu repartent une fois vers l'IA ; s'il en reste, le panneau le signale.

## 0.2.2

- Concepteur de règles : l'IA reçoit l'inventaire des entrées existantes du Ruleset (identifiants et noms, lus dans les parcours de l'assistant) et réutilise ce qui existe au lieu de proposer de le recréer ; chaque étape indique ce qu'elle réutilise.
- Les étapes s'affichent d'abord pour relecture : le MJ retire avec × celles qu'il ne veut pas, puis clique **Commencer**. En cours de route, **Passer cette étape** saute une étape sans l'appliquer.

## 0.2.1

- Concepteur de règles en plusieurs étapes : l'IA découpe la règle en parcours ordonnés. Une entrée dont la règle a besoin et qui manque au Ruleset (par exemple une définition Hauteur) devient une étape à créer d'abord, au lieu d'une question.
- Chaque étape est remplie avec les entrées créées par les étapes précédentes ; le MJ applique, puis passe à l'**Étape suivante**. Une étape refusée peut être refaite.
- Les questions de l'IA sont réservées aux valeurs de règle absentes du texte (nombre, dé, seuil).

## 0.2.0

- **Intégration à Rule Them'All** (API d'intégration 1.x, négociée sur les capacités) :
  - Systèmes → **AI Them'All**, juste après Feuilles : cards de génération du Ruleset (Créer, ouvrir, dupliquer, activer, supprimer, réordonner), stockées par AI Them'All ; une card dont le champ cible a disparu est signalée.
  - Bouton **Générer avec l'IA** sur les champs compatibles des feuilles RTA (MJ seulement) : choix de la card, précisions, génération, retouche ou choix de la variante, puis écriture par `updateTarget` ; refus si le champ a changé entre-temps.
  - Panneau **Décris ta règle (IA)** dans l'assistant : l'IA choisit un parcours et remplit ses réponses, `plan` les vérifie (deux corrections au plus), puis le parcours s'ouvre rempli dans l'assistant ; le MJ applique depuis l'aperçu. Ce qui est envoyé est montré avant le premier envoi.
- Génération de texte (Claude, API compatible OpenAI, Ollama) et d'images (API compatible OpenAI), images enregistrées dans le dossier du monde.

## 0.1.1

- Fenêtre « Fournisseur d'IA » (Paramètres du module → Configurer) : fournisseur, adresse, clé API, bouton **Tester la connexion**.
- Après un test réussi, les modèles texte et image se choisissent dans des listes remplies par le service (Claude, API compatible OpenAI, Ollama).
- Services texte et image indépendants : case « Même service que le texte », sinon fournisseur, adresse et clé propres aux images (Claude n'est pas proposé pour les images). Un test de connexion par service.
- Messages d'erreur explicites : service injoignable, clé refusée, réponse inattendue.

## 0.1.0

- Squelette du module Foundry VTT v14, sans dépendance à Rule Them'All.
- Réglages : fournisseur (Claude, API compatible OpenAI, Ollama), adresse, modèles texte et image ; clé API enregistrée dans le navigateur (portée client), jamais dans le monde.
- État de configuration consultable via `game.modules.get("ai-them-all").api.status()`, sans jamais exposer la clé.
- Détection optionnelle de Rule Them'All (API d'intégration 1.x) ; repli autonome avec diagnostic sinon.
- Tests Node et CI ; publication manuelle par `release.yml`.
- Un Rule Them'All sans API d'intégration (avant 1.1.0) est signalé par une simple information dans la console, mode autonome.
- Un Rule Them'All qui expose `integrations.capabilities` sans `apiVersion` est reconnu : la négociation se fait sur les capacités seules.
