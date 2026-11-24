# Inspecteur de décisions — interface minimale — [Planifié, Phase 3D-D]

> Aucun composant, canal IPC ni style n'est modifié par cette tranche documentaire.
> Le renderer actuel reçoit `simulation:status-changed` mais ne recharge que le statut :
> les cartes et la fiche personnage restent figées pendant un tick. L'action courante
> n'est pas exposée dans `CharacterInstance` : elle doit être lue dans l'historique.

## 1. Objectif

Rendre visible, sans graphique ni surcharge, trois informations déjà calculées par le moteur :

1. l'action courante de chaque personnage ;
2. les dernières actions du monde ou du personnage sélectionné ;
3. le détail complet d'une décision : motivations, scores, rejets, PRNG, états avant/après, effets attendus et appliqués.

L'UI n'est **pas** une source de vérité : elle affiche des vues validées par le main.

## 2. Contraintes

- Aucun accès direct à SQLite, Node ou `ipcRenderer` : tout passe par `window.digitalLife`.
- Aucun BLOB brut dans le renderer : le main décompresse et valide avant renvoi.
- Aucun flux non borné : pas d'événement IPC par personnage ni par décision.
- Aucun bouton sans action : chaque filtre et chaque lignée sélectionnable a un effet réel.
- Aucune modification du moteur : l'UI ne déclenche ni tick ni recalcul.

## 3. Canaux IPC proposés

Ajout à `IPC_CHANNELS` et à `DigitalLifeApi` :

```ts
DECISION_HISTORY: 'decision:history';
DECISION_RECORD: 'decision:record';

getDecisionHistory(query: DecisionHistoryQuery): Promise<DecisionSummaryView[]>;
getDecisionRecord(id: string): Promise<DecisionRecordV1>;
```

Validation côté main avant toute requête SQLite :

- `worldId` non vide ;
- `characterId`, s'il est fourni, appartient au monde ;
- `fromTick`/`toTick` sont des entiers `>= 0`, `fromTick <= toTick` ;
- `limit` est un entier entre 1 et 500, valeur par défaut 50 ;
- le tri est toujours `tick DESC`, puis `characterId ASC`, puis `id ASC` ;
- un `id` invalide ou introuvable produit une erreur technique explicite.

Le détail complet n'est chargé **qu'après sélection d'une ligne**.

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
  selectionRule: string;
  score: number;
  reason: string;
  warningCount: number;
}
```

`characterName` est lu depuis la colonne `decision_records.character_name`, qui copie le nom au moment de l'écriture. Aucune jointure avec `characters` n'est nécessaire : l'historique survit à la suppression d'une instance et l'UI affiche toujours le nom capturé. Pour les anciennes lignes dépourvues de cette colonne, la lecture stricte retourne une erreur technique au lieu d'un nom inventé ; aucune migration 3D n'a besoin de backfill car la table est nouvelle.

### 4.2 Action courante

L'action courante est le premier résumé retourné pour un personnage avec `limit: 1`. Aucun champ `currentAction` n'est ajouté à `CharacterInstance` dans cette phase : cela éviterait deux sources de vérité.

Si aucun historique n'existe encore pour un personnage, l'UI affiche `Aucune décision enregistrée`, jamais `idle` par inférence.

### 4.3 Inspecteur

L'inspecteur affiche, dans un ordre fixe :

1. identité `{worldId, characterId, tick, day, hour}` ;
2. action retenue, règle de sélection, score, motif ;
3. action précédente et état du runtime ;
4. motivations et urgences ;
5. objectifs immédiats et motivations exclues ;
6. candidats scorés, composantes et rejets ;
7. PRNG avant/après et nombre de tirages ;
8. états avant/après (besoins/émotions) ;
9. deltas passifs, effets d'action attendus/appliqués, avertissements.

Les valeurs hors bornes ou les versions inconnues sont affichées comme erreur de validation, pas comme texte libre partiel.

## 5. Composants proposés

```text
DecisionInspector.tsx      panneau principal, chargement et sélection
DecisionFilters.tsx        personnage, plage de ticks, limite
DecisionSummaryList.tsx    liste bornée des résumés
DecisionDetailView.tsx     détail d'un DecisionRecordV1
```

Insertion minimale :

- `WorldView.tsx` : panneau repliable « Décisions récentes » sous les contrôles de simulation ; filtre monde + personnage ; aucune nouvelle page ;
- `CharacterDetail.tsx` : bouton « Voir les décisions » qui ouvre le même panneau préfiltré sur le personnage.

Aucun graphique Recharts n'est ajouté. La présentation reste du texte et des listes.

## 6. Rafraîchissement

1. S'abonner une seule fois à `onSimulationStatusChanged` dans `WorldView`.
2. Ignorer les statuts dont `worldId` diffère.
3. Mémoriser le dernier `clock.tick` traité.
4. Si le tick n'a pas changé, ne rien charger.
5. Si le tick a changé, programmer une invalidation au plus toutes les 500 ms.
6. À l'invalidation, recharger la liste des personnages et le résumé d'historique pour la sélection courante uniquement.
7. Incrémenter un jeton local à chaque chargement ; ignorer toute réponse dont le jeton n'est plus courant.
8. Laisser l'inspecteur détaillé intact tant que l'utilisateur ne sélectionne pas une autre ligne.

Le désabonnement est appelé au démontage. Aucun timer n'est créé par personnage.

## 7. États et messages

| État | Comportement |
|---|---|
| Chargement | Indicateur discret, liste précédente conservée si elle existe. |
| Vide | `Aucune décision enregistrée pour ces filtres.` |
| Erreur IPC | Message d'erreur, bouton « Réessayer » qui relance exactement la même requête validée. |
| Détail introuvable | Retour à la liste sans vider les filtres. |
| Version inconnue | Erreur technique affichée, aucune tentative de rendu partiel. |

## 8. Tests prévus

**IPC/main**

- bornes de `limit`, plage de ticks, `characterId` étranger au monde ;
- ordre de tri stable ;
- décompression et validation avant renvoi ;
- aucun BLOB dans la réponse ;
- erreurs sur `id` inconnu.

**Renderer (Testing Library)**

- abonnement/désabonnement unique ;
- aucun chargement si le tick est identique ;
- au plus un chargement par fenêtre de 500 ms ;
- changement de sélection annule la réponse périmée ;
- états chargement/vide/erreur/détail ;
- absence de `ipcRenderer`, `require` ou accès SQLite dans le bundle renderer.

**Intégration**

- une décision écrite au tick N est visible après rafraîchissement ;
- filtre par personnage et par tick ;
- 100 personnages : aucun flux IPC proportionnel au nombre de personnages.

## 9. Critères d'acceptation

- Deux canaux de lecture ajoutés, aucun canal d'écriture.
- `limit <= 500` vérifié côté main.
- Aucun appel IPC déclenché par un changement de statut sans changement de tick.
- Aucun accès Node ou SQLite dans le renderer.
- Les tests existants de `WorldView` et `CharacterDetail` passent sans modification de comportement non liée à cette fonctionnalité.

## 10. Hors périmètre

Graphiques, carte sociale, filtres textuels sur les motifs, tri côté renderer, export CSV, historique temps réel complet, édition ou suppression d'une décision, événements Phase 5.
