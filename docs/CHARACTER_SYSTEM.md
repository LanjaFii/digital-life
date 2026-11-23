# Système de personnages

## État actuel (Phase 1 — création manuelle + bibliothèque)

Trois sources de personnages coexistent :

1. **Génération aléatoire déterministe** (`generationMode=random`) : seed du monde + PRNG seedé, inchangée.
2. **Création manuelle** : formulaire en 6 étapes depuis l'écran d'un monde.
3. **Bibliothèque personnelle** : modèles réutilisables (`CharacterTemplate`) instanciables dans n'importe quel monde en préparation.

Tout est persisté dans `data/saves/worlds.sqlite` (tables `characters` et `character_templates`).
Les systèmes de simulation (décisions, interactions, évolution dynamique, mémoire, mort) restent **[Planifié]**.

## CharacterTemplate vs CharacterInstance

Distinction fondamentale (types dans `src/shared/character.ts`) :

- **`CharacterTemplate`** : le *modèle* conservé dans la bibliothèque. Il ne vit dans aucun monde.
  Il porte l'identité, la biographie et les paramètres de départ (traits, émotions, besoins, objectifs),
  plus `createdAt` / `updatedAt`.
- **`CharacterInstance`** (`Character` est un alias) : le personnage *d'un monde particulier*.
  Il porte `worldId`, une référence **facultative et purement informative** `templateId`,
  ses données propres, `createdAt` / `updatedAt`, et deux états séparés :
  - `initialState` : paramètres de départ (verrouillés dès que la simulation démarrera) ;
  - `currentState` : état courant (identique à l'initial pour l'instant ; évoluera avec le moteur futur).

`CharacterState` = `{ traits, emotions, needs, goals }`, partagé par le modèle et les deux états
de l'instance : pas de duplication de structures.

### Stratégie de copie et indépendance

- **Instancier un modèle = copie profonde des données** dans une nouvelle instance avec un
  nouvel `id` unique (UUID), associée au `worldId` cible. Aucune référence partagée :
  les JSON sont re-sérialisés côté SQLite.
- **Aucune synchronisation automatique** entre modèle et instances :
  - modifier une instance ne touche ni le modèle ni les autres instances ;
  - modifier le modèle ne touche aucune instance existante (seules les futures instances
    utilisent les nouvelles valeurs) ;
  - supprimer le modèle ne supprime aucune instance : la colonne `characters.template_id`
    est simplement remise à `NULL` (référence informative), jamais de cascade.
- Chaque monde est isolé par `world_id` ; supprimer un monde supprime ses instances
  (cascade existante), jamais les modèles.

## Échelles numériques

- **Traits de personnalité** : entier `0-100` (0 = très faible, 50 = neutre, 100 = très fort).
- **Émotions** : entier `0-100` (0 = absent, 100 = intense).
- **Besoins** : entier `0-100` (**100 = besoin satisfait**, 0 = critique).
- **Âge** : entier `18-65`.
- **Genre** : `female | male | nonbinary`.

## Clés exactes (validées côté main)

### Traits (21, `TRAIT_KEYS`)
`sociability`, `empathy`, `aggression`, `patience`, `impulsivity`, `curiosity`,
`intelligence`, `creativity`, `honesty`, `altruism`, `ambition`, `courage`,
`timidity`, `distrust`, `optimism`, `humor`, `jealousy`, `discipline`,
`independence`, `loyalty`, `resilience`.

### Émotions (10, `EMOTION_KEYS`)
`happiness`, `sadness`, `stress`, `anxiety`, `anger`, `fear`, `confidence`,
`loneliness`, `motivation`, `satisfaction`.

### Besoins (8, `NEED_KEYS`)
`hunger`, `thirst`, `energy`, `sleep`, `health`, `hygiene`, `socialization`, `safety`.

### Objectifs
Exactement **1 principal** (`kind: primary`) + **2 secondaires** (`kind: secondary`),
chacun avec `id`, `label` (non vide, ≤ 120 caractères), `kind`.

## Création manuelle (formulaire en 6 étapes)

`src/renderer/components/CharacterForm.tsx`, accessible depuis l'écran d'un monde
(« Créer un personnage ») et depuis la bibliothèque (« Créer un modèle ») :

1. **Identité** : prénom*, nom*, âge (18-65), genre, biographie (≤ 500 caractères).
2. **Personnalité** : 21 sliders (libellés + descriptions FR, valeur numérique éditable).
   Bouton « Générer une personnalité cohérente » : réutilise la logique du générateur
   déterministe (`generateDraftState`, contraintes de cohérence) via IPC — jamais obligatoire.
3. **Émotions initiales** : 10 sliders.
4. **Besoins initiaux** : 8 sliders (100 = satisfait).
5. **Objectifs** : 1 principal + 2 secondaires.
6. **Récapitulatif** : fiche de prévisualisation, retour aux étapes précédentes possible.
   En contexte monde : case « Enregistrer aussi ce modèle dans ma bibliothèque »
   (monde seul, ou monde + bibliothèque).

La validation UI bloque les étapes invalides ; la validation **définitive** est côté main
(`character-validation.service.ts`) : chaînes, longueurs, âge, genre, entiers 0-100,
les 21/10/8 clés exactes, objectifs, existence du monde/modèle.

## Bibliothèque personnelle

`src/renderer/components/LibraryView.tsx`, entrée « Ma bibliothèque » du menu principal :

- Cartes modèles (identité, bio, 3 traits dominants, dates création/modification).
- Recherche par prénom/nom ; états chargement, vide, erreur, aucun résultat.
- Actions par carte : **Détail**, **Modifier**, **Utiliser** (choix d'un monde puis
  instanciation, `UseInWorldDialog`), **Supprimer** (confirmation modale).
- Création de modèle sans monde possible.
- Persistante après redémarrage (SQLite).

## Modification d'une instance en préparation

Depuis la fiche d'un personnage du monde : « Modifier ce personnage » (même formulaire).
Tant que `worlds.status = 'preparation'`, l'identité, la bio et les paramètres initiaux
sont modifiables ; `initialState` et `currentState` sont réalignés (pas encore de simulation).
Quand `status = 'simulation_started'` (futur), toute création/instanciation/modification
est refusée côté main (`assertWorldPreparation`). **Aucun faux démarrage de simulation
n'est implémenté dans cette tranche** ; le champ `status` prépare la règle.

## Génération déterministe (inchangée)

- PRNG seedé `mulberry32` (`src/main/services/prng.ts`), aucun `Math.random()` dans le générateur.
- Même seed + mêmes paramètres ⇒ mêmes personnages.
- Traits contraints pour limiter les incohérences (sociabilité/timidité, agressivité/empathie, etc.).
- `generateDraftState(seed)` expose traits/émotions/besoins cohérents pour le bouton aléatoire du formulaire.

## API / IPC

Renderer → preload → IPC → main → SQLite uniquement. Canaux (`src/shared/ipc.ts`) :

| Canal | Preload | Rôle |
|---|---|---|
| `character:list` | `listCharacters(worldId)` | Personnages d'un monde |
| `character:create` | `createCharacter(input)` | Création manuelle (+ modèle si `saveAsTemplate`) |
| `character:update` | `updateCharacter(id, worldId, input)` | Modification d'instance (préparation) |
| `character:random-draft` | `generateRandomDraft()` | Personnalité aléatoire cohérente |
| `template:list` | `listTemplates()` | Bibliothèque |
| `template:get` | `getTemplate(id)` | Détail modèle |
| `template:create` | `createTemplate(input)` | Nouveau modèle |
| `template:update` | `updateTemplate(input)` | Modification modèle |
| `template:delete` | `deleteTemplate(id)` | Suppression modèle (instances intactes) |
| `template:instantiate` | `instantiateTemplate(input)` | Copie indépendante dans un monde |

Toutes les entrées sont validées côté main ; aucune connexion SQLite exposée au renderer.

## [Planifié]

- Moteur de simulation : `currentState` évoluera, `initialState` restera la référence verrouillée.
- Démarrage de simulation (`worlds.status = 'simulation_started'`) et verrouillage effectif côté UI.
- Relations, mémoire, décisions, événements, mort, dialogues LLM.
