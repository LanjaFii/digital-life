# Inspecteur de décisions — interface minimale — [Implémenté, Phase 3D-D]

> Tranche 3D-D livrée le 2026-11-27 : deux canaux IPC **lecture seule**, un panneau
> « Décisions récentes » dans `WorldView`, un accès facultatif depuis `CharacterDetail`,
> aucune nouvelle page, aucun graphique et aucune commande de simulation.
> L'UI n'est **pas** une source de vérité : elle n'affiche que des vues validées par le main.

## 1. Objectif

Rendre visible, sans graphique ni surcharge, trois informations déjà calculées par le moteur :

1. l'action courante de chaque personnage (par le résumé le plus récent) ;
2. les dernières actions du monde ou du personnage sélectionné ;
3. le détail complet d'une décision : motivations, scores, rejets, PRNG, états avant/après, effets attendus et appliqués.

## 2. Contraintes respectées

- Aucun accès direct à SQLite, Node ou `ipcRenderer` : tout passe par `window.digitalLife`.
- Aucun BLOB brut, statement ou ligne SQLite dans le renderer : le main décompresse et valide avant renvoi.
- Aucun flux non borné : pas d'événement IPC par personnage ni par décision.
- Aucun bouton sans action : sélection, pagination, fermeture du détail et réessai ont un effet réel.
- Aucune mutation depuis l'inspecteur : ni tick, ni statut, ni personnage, ni émotion/besoin/action/décision.
- Aucun changement de schéma SQLite, de moteur de décision, de PRNG ou de worker de calcul.

## 3. Canaux IPC et validation

`IPC_CHANNELS` et `DigitalLifeApi` exposent exactement deux canaux, enregistrés dans
`src/main/ipc/decision.ipc.ts` et appelés depuis `src/preload/preload.ts` :

```ts
DECISION_HISTORY: 'decision:history';
DECISION_RECORD: 'decision:record';

getDecisionHistory(query: DecisionHistoryQuery): Promise<DecisionSummaryView[]>;
getDecisionRecord(worldId: string, id: string): Promise<DecisionRecordV1>;
```

Le `worldId` est **obligatoire** sur les deux canaux : la clé primaire d'un enregistrement
étant `${worldId}:${tick}:${characterId}`, l'identifiant seul ne suffit pas à garantir
l'isolation entre mondes. Validation stricte dans le main, avant tout accès SQLite :

- `DecisionHistoryQuery` n'accepte que `worldId`, `characterId`, `fromTick`, `toTick`, `limit`, `offset` ;
- `worldId` et `characterId` non vides ; `characterId` n'a **pas** besoin de désigner un personnage encore existant (l'historique survit à sa suppression) ;
- `fromTick`/`toTick` : entiers `>= 0`, avec `fromTick <= toTick` ;
- `limit` : entier de 1 à 500, défaut 50 ; `offset` : entier de 0 à 1 000 000, défaut 0 ;
- identifiant de détail : forme `${worldId}:${tick}:${characterId}`, tick entier sûr `>= 0` ;
- tri SQL stable : `tick DESC, character_id ASC, id ASC` ;
- toute clé inconnue, valeur invalide ou plage incohérente rejette la requête.

`src/main/services/decision-read.service.ts` est la seule façade de lecture. Le store
`decision-history.store.ts` libère ses statements dans un `finally`, normalise les erreurs
zlib, rejette **toute la page** si une seule ligne est corrompue (D3), et vérifie la version,
le checksum `payloadSha256`, la taille canonique et la cohérence des colonnes avec le BLOB.
Les erreurs d'ID introuvable, de hash invalide et de version inconnue restent des erreurs
techniques explicites : aucun rendu partiel n'est tenté.

## 4. Données affichées

### 4.1 Résumé (`DecisionSummaryView`)

```ts
interface DecisionSummaryView {
  id: string;
  characterId: string;
  characterName: string;
  tick: number;
  day: number;
  hour: number;
  previousActionId: string | null;
  selectedActionId: string;
  selectionRule: DecisionRule;
  score: number;
  reason: string;
  warningCount: number;
}
```

Douze champs exactement, validés par `validateDecisionSummaryView()` côté main. `characterName`
est lu depuis `decision_records.character_name`, capturé à l'écriture : aucune jointure avec
`characters`, aucun nom inventé, aucune dépendance à l'existence actuelle du personnage.
Le détail, lui, transmet le `DecisionRecordV1` complet (D7) ; la structuration visuelle est
faite dans React, sans JSON brut.

### 4.2 Action courante

L'action courante est le résumé le plus récent d'un personnage. Aucun champ `currentAction`
n'est ajouté à `CharacterInstance` : cela créerait deux sources de vérité. Si aucun
historique n'existe, l'UI affiche « Aucune décision enregistrée », jamais `idle` par inférence.

### 4.3 Détail en douze sections

`DecisionDetail.tsx` affiche, dans un ordre fixe, douze sections repliables lorsque l'information
est secondaire. Chaque section porte un badge qui distingue **fait observé**, **motivation** et
**explication du moteur** :

| # | Section | Nature |
|---|---|---|
| 1 | Identité et contexte (personnage, monde, temps simulé, création) | fait observé |
| 2 | Action précédente et action retenue (règle, score) | fait observé |
| 3 | Motivations et urgences (besoins/émotions écartées) | motivation |
| 4 | Objectifs immédiats | motivation |
| 5 | Candidats et scores (faisabilité, composantes, rejets) | explication du moteur |
| 6 | Règles appliquées | explication du moteur |
| 7 | Rejets et motifs | explication du moteur |
| 8 | Effets attendus (besoins/émotions) | explication du moteur |
| 9 | États avant et après (besoins/émotions, runtime) | fait observé |
| 10 | Deltas appliqués (passifs, action, effectifs) | fait observé |
| 11 | Hasard et versions (PRNG, tirages, versions) | explication du moteur |
| 12 | Traçabilité et avertissements (empreinte abrégée, taille, warnings) | fait observé |

L'empreinte complète n'est pas affichée en clair dans le panneau : seul un extrait court est
montré (les tests vérifient l'absence du hash intégral dans le DOM).

## 5. Composants livrés

```text
DecisionPanel.tsx        liste, pagination, sélection, états, ouverture du détail
DecisionDetail.tsx       détail typé en douze sections
decision-labels.ts       libellés et formatages (actions, règles, urgences, scores, temps)
use-decision-history.ts  hooks de liste et de détail, throttle, jeton, réessai
```

Insertion effective :

- `WorldView.tsx` : panneau repliable « Décisions récentes » sous les contrôles de simulation ;
- `CharacterDetail.tsx` : propriété facultative `decisions={{ worldId, revision }}`, qui ouvre le
  même panneau préfiltré sur le personnage avec le titre « Décisions de ce personnage ».

Aucun graphique Recharts n'est ajouté. La présentation reste du texte et des listes. La
bibliothèque de personnages est inchangée.

## 6. Rafraîchissement

1. Un seul abonnement à `onSimulationStatusChanged`, conservé dans `WorldView`.
2. `decisionTick` dérive de `status.clock?.tick ?? 0` ; un statut sans tick n'entraîne aucun appel.
3. Tant que le tick est identique, `WorldView` ne modifie pas son état : aucun rechargement.
4. `useDecisionHistory` impose au plus une requête par fenêtre de 500 ms et programme un timer
   pour les changements survenus dans la fenêtre.
5. Chaque charge incrémente un jeton local : une réponse dont le jeton n'est plus courant est ignorée.
6. Le désabonnement et le timer sont nettoyés au démontage. Aucun timer par personnage.
7. `useDecisionRecord` ne charge le détail qu'après sélection explicite d'une ligne ; changer de
   ligne invalide la requête précédente par le même mécanisme de jeton.
8. Le filtre `characterId`, la pagination par `offset` et le réessai relancent une requête validée
   identicale ; le détail reste intact tant que l'utilisateur ne sélectionne pas une autre ligne.

## 7. États et messages

| État | Comportement |
|---|---|
| Chargement | Indicateur discret ; la liste précédente reste affichée si elle existe. |
| Vide | « Aucune décision enregistrée » avec explication sur l'avancement de la simulation. |
| Erreur IPC | `role="alert"`, message technique, bouton « Réessayer » qui relance la même requête. |
| Détail indisponible | « Détail indisponible. » dans le cadre du détail, sans vider la liste. |
| Version inconnue / corruption | Erreur technique du main, aucun rendu partiel. |
| Pagination | « Retour » / « Plus » avec `aria-label` explicite, désactivés hors limites. |

## 8. Tests livrés

- `tests/decision-view.test.ts` : validateurs, valeurs par défaut, bornes, clés inconnues, vues invalides ;
- `tests/decision-read.test.ts` : isolation mondes/personnages, tri stable et pagination par offset,
  projection légère, personnage supprimé, monde supprimé, checksum altéré, BLOB corrompu,
  version inconnue, historique vide ;
- `tests/decision-ipc.test.ts` : deux canaux uniquement, validation et normalisation des paramètres,
  absence d'appel service sur entrée invalide ;
- `tests/decision-inspector-ui.test.tsx` : liste, douze sections, absence de mutation, pagination,
  états vide/erreur/réessai, filtre par personnage, throttle, jeton périmé, détail à la demande ;
- `tests/world-resume-ui.test.tsx` : abonnement unique et absence de recharge sur tick identique ;
- `tests/phase0.test.ts` et les trois mocks UI : parité stricte des canaux et de l'API.

Résultats de la tranche : 63 tests ciblés verts, suite complète 335/335 (36 fichiers, hors tests
longs et benchmark), 18 Golden Hash inchangés, typecheck des quatre configurations, check-deps
et build production réussis.

## 9. Critères d'acceptation

- Deux canaux de lecture ajoutés, aucun canal d'écriture.
- `limit <= 500` vérifié côté main ; `worldId` obligatoire sur les deux canaux.
- Aucun appel IPC déclenché par un changement de statut sans changement de tick.
- Aucun accès Node, SQLite ou BLOB brut dans le renderer.
- Aucune mutation de simulation depuis l'inspecteur.
- Les tests existants de `WorldView`, `CharacterDetail` et de la bibliothèque passent sans
  modification de comportement non liée à cette fonctionnalité.

## 10. Limites connues et hors périmètre

- Les filtres `fromTick`/`toTick` sont validés et appliqués côté main, mais le panneau n'expose
  qu'un filtre par personnage et la pagination : pas de formulaire de plage de ticks, par choix
  d'interface minimale.
- `canGoNext` repose sur une page pleine : une dernière page exactement pleine propose un « Plus »
  supplémentaire qui revient vide ; la pagination reste bornée et sans comptage total, volontairement.
- Le rafraîchissement repose sur `clock.tick` : un changement de contenu sans changement de tick
  (par exemple une correction hors simulation) ne déclenche pas de recharge automatique.
- Graphiques, carte sociale, filtres textuels sur les motifs, tri côté renderer, export CSV,
  historique temps réel complet, édition ou suppression d'une décision, événements Phase 5 :
  hors périmètre.
