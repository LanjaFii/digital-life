# Historique technique des décisions — [Planifié, Phase 3D]

> Aucune table, aucun service, aucun IPC et aucune UI ne sont implémentés par cette tranche
> documentaire. Le moteur Phase 3C calcule `DecisionExplanation` à chaque tick, mais
> `stepSimulation()` ne persiste aujourd'hui que besoins/émotions (miroirs legacy et `current_*`),
> le runtime (`current_action_json`), l'horloge/`rngState`, `updated_at` et `worlds.status`.
> Il n'écrit ni traits, ni `current_goals_json`, ni `decisions`/`actionDeltas`/`warnings`.

## 1. Deux notions distinctes

| Notion | Question | Nature | Phase |
|---|---|---|---|
| **Historique technique des décisions** | « Pourquoi ce personnage a-t-il choisi cette action à ce tick ? » | Audit interne, déterministe, complet, versionné | 3D |
| **Journal canonique des événements** | « Qu'est-il arrivé dans le monde, dans l'ordre ? » | Fait objectif du monde, source de vérité narrative | 5 |

L'historique 3D n'est **pas** le journal de la Phase 5 :

- il n'a pas de typologie d'événements ni de cascades ;
- il n'est pas une source de vérité pour les conséquences du monde ;
- il ne produit pas de souvenirs subjectifs ;
- il ne modifie ni les relations ni les décisions futures.

Il est consulté pour expliquer, auditer et rejouer. Le futur événement Phase 5 pourra référencer une décision par `sourceDecisionId`, mais l'inverse n'est pas prévu : une décision reste un artefact technique, pas un fait narratif.

## 2. Ce qui manque aujourd'hui

`DecisionExplanation` contient déjà : `worldId`, `characterId`, `tick`, `day`, `hour`, `ruleId`, `motivations`, `immediateGoals`, `candidateScores`, `selectedActionId`, `selectionRule`, `reason`, `rejected`, `expectedEffects`, `rngStateBefore`, `rngStateAfter`, `rngDraws`.

Il ne contient pas encore :

- les urgences `needUrgencies` / `emotionUrgencies` calculées par `selectImmediateGoals()` ;
- la version du registre d'actions, des paramètres et du moteur ;
- l'action précédente et l'état du runtime avant décision ;
- la persistance des effets et avertissements déjà calculés (`ActionEffectDelta`, `deltas`, `warnings`) dans l'enregistrement ;
- l'état avant/après du personnage ;
- un identifiant d'enregistrement stable et une somme de contrôle.

La solution retenue est un contrat additif `DecisionRecordV1` qui **enveloppe** `DecisionExplanation` sans le modifier. Aucun champ existant n'est supprimé ni réinterprété.

## 3. Contrat `DecisionRecordV1`

```ts
interface DecisionRecordV1 {
  id: string;                      // `${worldId}:${tick}:${characterId}`
  recordVersion: 1;
  engineVersion: string;           // ex. "phase3d.1"
  registryVersion: number;         // ACTION_REGISTRY.version
  parametersVersion: number;       // SimulationParametersV1.version
  ruleIds: readonly string[];      // decision.v1, goal.immediate.v1, causes de deltas

  explanation: DecisionExplanation;
  score: number;                   // score du candidat retenu

  needUrgencies: Readonly<Record<NeedKey, number>>;
  emotionUrgencies: Readonly<Record<EmotionKey, number>>;

  previousAction: {
    actionId: ActionId | null;
    rule: DecisionRule | null;
    tick: number | null;
    active: boolean;
  };
  newAction: {
    actionId: ActionId;
    rule: DecisionRule;
  };

  characterName: string;           // nom copié à l'écriture, stable après suppression
  stateBefore: {
    needs: CharacterNeeds;
    emotions: CharacterEmotions;
    runtime: CharacterActionRuntime;
  };
  stateAfter: {
    needs: CharacterNeeds;
    emotions: CharacterEmotions;
    runtime: CharacterActionRuntime;
  };

  passiveDeltas: readonly TickDelta[];
  actionDeltas: readonly ActionEffectDelta[];
  appliedDeltas: readonly TickDelta[];
  warnings: readonly string[];

  // Métadonnées d'intégrité, exclues du hash mais conservées dans le BLOB.
  payloadSha256: string;
  uncompressedBytes: number;
  createdAt: string;
}
```

`DecisionRecordPayloadV1` désigne le même objet **sans** `payloadSha256`, `uncompressedBytes` ni `createdAt`. `canonicalDecisionPayload(record)` produit son JSON canonique ; `payloadSha256` est le SHA-256 de ce JSON. Le BLOB contient le JSON canonique du `DecisionRecordV1` **complet**, compressé avec zlib : les champs d'intégrité et `createdAt` sont donc reconstruisibles sans perte. `uncompressedBytes` mesure la taille du JSON complet avant compression.

`CharacterTickResult` gagne un tableau additif `decisionRecords: DecisionRecordV1[]`. Le tableau `decisions` existant reste produit pour la compatibilité des tests ; les deux ne doivent jamais diverger.

### 3.1 Lien décision → deltas → état

Le lien est l'identifiant naturel `{world_id, tick, character_id}` :

- `explanation.selectedActionId` donne l'action retenue ;
- `actionDeltas` porte `expected` et `applied` par champ, avec le même `actionId` et le même `tick` ;
- `appliedDeltas` explique l'état final aux centièmes ;
- `stateAfter` doit être égal à `current_needs_json`, `current_emotions_json` et `current_action_json` uniquement. Le tick n'écrit ni `current_traits_json` ni `current_goals_json`.

Toute incohérence est une erreur technique, pas une correction automatique.

## 4. Modèle SQLite proposé

```sql
CREATE TABLE IF NOT EXISTS decision_records (
  id TEXT PRIMARY KEY,                    -- `${worldId}:${tick}:${characterId}`
  world_id TEXT NOT NULL,
  character_id TEXT NOT NULL,             -- historique : aucune FK vers characters
  tick INTEGER NOT NULL,
  day INTEGER NOT NULL,
  hour INTEGER NOT NULL,

  record_version INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  registry_version INTEGER NOT NULL,
  parameters_version INTEGER NOT NULL,

  character_name TEXT NOT NULL,
  previous_action_id TEXT,
  selected_action_id TEXT NOT NULL,
  selection_rule TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT NOT NULL,

  rng_state_before INTEGER NOT NULL,
  rng_state_after INTEGER NOT NULL,
  rng_draws INTEGER NOT NULL CHECK (rng_draws BETWEEN 0 AND 1),

  warnings_json TEXT NOT NULL,
  state_before_json TEXT NOT NULL,
  state_after_json TEXT NOT NULL,
  deltas_json TEXT NOT NULL,

  payload_blob BLOB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  uncompressed_bytes INTEGER NOT NULL,

  created_at TEXT NOT NULL,

  UNIQUE (world_id, tick, character_id),
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_decision_records_world_tick
  ON decision_records(world_id, tick DESC);
CREATE INDEX IF NOT EXISTS idx_decision_records_character_tick
  ON decision_records(world_id, character_id, tick DESC);
```

### 4.1 Contraintes et choix

- `id` est déterministe, sans UUID : il ne dépend d'aucun aléa extérieur à la simulation.
- `character_id` n'a **pas** de clé étrangère : l'historique doit survivre à la suppression d'une instance. Dans l'état actuel, cette suppression est de toute façon interdite hors `preparation`, donc aucun historique n'existe encore à ce moment ; l'absence de FK reste une garantie d'audit.
- `world_id` a une cascade : supprimer un monde supprime tout son historique.
- `UNIQUE(world_id, tick, character_id)` garantit exactement une décision par personnage et par tick.
- `character_name` est une copie du nom au moment de l'écriture : l'UI n'a pas besoin de joindre `characters`, et l'historique reste lisible après suppression d'une instance.
- `created_at` est une métadonnée de diagnostic produite par le main avec `new Date().toISOString()` ; aucune règle métier ne la lit.
- `payload_blob` est le JSON canonique complet du `DecisionRecordV1`, compressé avec `zlib.deflateSync` côté main. La compression n'affecte pas le déterminisme de la simulation ; `payload_sha256` porte sur `canonicalDecisionPayload(record)` avant compression. Un BLOB compressé valide doit redonner, après décompression, exactement les champs `payloadSha256`, `uncompressedBytes` et `createdAt` des colonnes.
- Les colonnes `state_before_json`, `state_after_json` et `deltas_json` sont des copies de contrôle ; `deltas_json` contient `passiveDeltas`, `actionDeltas` et `appliedDeltas`. Elles permettent de détecter une divergence sans décompresser le BLOB, mais ne remplacent jamais le BLOB comme source de vérité.

## 5. Validation stricte

La validation est divisée en deux niveaux distincts.

**À l'écriture et à la lecture** :

1. `id === \`${explanation.worldId}:${explanation.tick}:${explanation.characterId}\`` et `recordVersion === 1`, versions de registre/paramètres connues ;
2. SHA-256 de `canonicalDecisionPayload(record)` égal à `payload_sha256` ;
3. `uncompressed_bytes <= 65536` et taille BLOB `<= 16384` ;
4. `selected_action_id` appartient à `ACTION_IDS` ;
5. `selection_rule` appartient à la constante runtime `DECISION_RULES` (six valeurs : `score_tiebreak_rng`, `score_tiebreak_id`, `forced_idle`, `continue_active`, `interruption`, `action_failed`) ;
6. `rng_draws` vaut 0 ou 1, `rng_state_*` sont des uint32 ;
7. toutes les valeurs `needs`/`emotions` sont finies et dans `[0, 100]`.

**À l'écriture uniquement**, lorsque le snapshot du tick est encore disponible :

8. `characterId` présent dans le snapshot du tick ;
9. `stateAfter` égal à `current_needs_json`, `current_emotions_json` et `current_action_json` calculés pour le tick ;
10. nombre d'enregistrements égal au nombre de personnages du tick.

Ces trois derniers contrôles ne sont pas applicables à une lecture différée, notamment après suppression d'une instance : la lecture valide uniquement l'intégrité interne de l'enregistrement.

Une violation lève une erreur technique. Aucune réparation silencieuse, aucun `try/catch` qui remplace une valeur invalide par une valeur par défaut.

## 6. Migration

Dans la tranche 3D-A :

1. `CREATE TABLE IF NOT EXISTS decision_records` et les deux index ;
2. `CREATE TABLE IF NOT EXISTS schema_migrations` avec `version`, `applied_at`, `description` ;
3. insertion de la version `3D-1` après succès des étapes précédentes ;
4. aucun backfill : les parties historiques ne sont pas reconstituées par inférence ;
5. les anciens `PRAGMA table_info` et `ALTER TABLE ADD COLUMN` restent actifs.

Les bases Phase 1/3A/3B/3C restent lisibles. Le premier tick après migration crée les premières lignes.

## 7. Rétention et croissance

Aucune purge automatique en 3D. Voir [PHASE_3D_DESIGN.md](PHASE_3D_DESIGN.md) §7 pour les estimations à 10, 50 et 100 personnages à 1x et 10x.

L'UI applique une fenêtre d'affichage de 500 entrées maximum. Ce n'est pas une limite de stockage. Une politique de purge ou d'archivage nécessitera une décision produit séparée.

## 8. IPC proposé

Deux canaux de lecture uniquement :

```ts
interface DecisionHistoryQuery {
  worldId: string;
  characterId?: string;
  fromTick?: number;
  toTick?: number;
  limit?: number;   // borné côté main à 500
}

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

getDecisionHistory(query: DecisionHistoryQuery): Promise<DecisionSummaryView[]>;
getDecisionRecord(id: string): Promise<DecisionRecordV1>;
```

Les canaux proposés sont `DECISION_HISTORY: 'decision:history'` et
`DECISION_RECORD: 'decision:record'`. La validation des bornes et l'ordre de tri sont
décrits dans [DECISION_INSPECTOR_UI.md](DECISION_INSPECTOR_UI.md).

Aucune écriture, aucune suppression et aucun déclenchement de tick via ces canaux. Le renderer ne voit jamais de BLOB brut : le main décompresse et valide avant de renvoyer un objet typé.

## 9. Tests prévus

**Unitaires**

- sérialisation/désérialisation `DecisionRecordV1`, sans perte des champs d'intégrité ;
- hash canonique stable, avec `DECISION_RULES` comme source runtime des six règles ;
- rejet des versions inconnues, tailles excessives, actions inconnues, règles inconnues, valeurs hors bornes ;
- compression/décompression sans perte ;
- limitation `limit` de la query, valeur par défaut 50 et maximum 500.

**Intégration SQLite**

- une ligne par personnage et par tick sur 1 et 2 personnages ;
- écriture dans la même transaction que l'état et l'horloge ;
- hook `_setTickFailureForTests(() => { throw new Error('...'); })` : aucun enregistrement orphelin après rollback ;
- réouverture : enregistrement lisible et hash valide ;
- ancienne base sans table : migration additive réussie ;
- suppression d'un monde : cascade de l'historique ;
- suppression d'une instance : historique conservé, avec insertion directe préalable via un helper de test `_insertDecisionRecordForTests()` car la garde `assertWorldPreparation` interdit cette suppression dès qu'un historique simulateur existe ;
- mesure de taille sur simulation longue.

**Golden Hash**

- mêmes seed/entrées/règles => même JSON canonique, avant et après passage au worker.

## 10. Hors périmètre

Événements canoniques Phase 5, souvenirs, relations, mort, LLM, génération de texte narratif, purge, export/import d'historique, paramétrage utilisateur de la verbosité.
