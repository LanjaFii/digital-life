# Historique technique des décisions — Phase 3D-A

> Le moteur Phase 3C calcule `DecisionExplanation` à chaque tick, mais avant 3D-A
> `stepSimulation()` ne persistait que besoins/émotions (miroirs legacy et `current_*`),
> le runtime (`current_action_json`), l'horloge/`rngState`, `updated_at` et `worlds.status`.
> Il n'écrivait ni traits, ni `current_goals_json`, ni `decisions`/`actionDeltas`/`warnings`.
> La tranche 3D-A ajoute uniquement l'historique technique : aucun IPC, preload, UI,
> worker, verrou global ni changement de persistance fichier n'est concerné.
>
> **Statut : tranches 3D-A à 3D-D implémentées et validées.** Le calcul Phase 3C
> reste byte-identique à entrées égales (18 Golden Hash inchangés, matrice étendue 96/96 en test
> long isolé), y compris via le worker branché en 3D-C3. La suite complète passe 335/335
> (36 fichiers, hors tests longs et benchmark), typecheck des quatre configurations et build
> réussis. La tranche 3D-D ajoute uniquement une lecture IPC bornée et l'inspecteur UI :
> aucun changement de schéma, de moteur, de PRNG ni de worker. Voir [DECISION_INSPECTOR_UI.md](DECISION_INSPECTOR_UI.md).

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

## 2. Lacunes identifiées avant 3D-A (comblées)

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
interface DecisionRecordPayloadV1 {
  id: string;                      // `${worldId}:${tick}:${characterId}`
  recordVersion: 1;
  engineVersion: string;           // "phase3d.1"
  registryVersion: number;         // ACTION_REGISTRY.version
  parametersVersion: number;       // SimulationParametersV1.version
  ruleIds: readonly string[];      // union triée et unique des identifiants de règles

  explanation: DecisionExplanation;
  score: number;                   // score réellement utilisé, 0 si aucune évaluation

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
}

interface DecisionRecordV1 extends DecisionRecordPayloadV1 {
  // Métadonnées ajoutées par le store, exclues du hash et du calcul.
  payloadSha256: string;
  uncompressedBytes: number;
  createdAt: string;
}
```

Corrections apportées avant l'implémentation, afin de préserver le déterminisme Phase 3C :

- `computeCharacterTick()` produit uniquement `DecisionRecordPayloadV1` dans son tableau
  additif `decisionRecords`, indexé comme `decisions`, `characterStates` et
  `actionRuntimeStates`. Aucune horloge, compression ou hash n'est calculé dans la règle pure.
- Le store ajoute `payloadSha256`, `uncompressedBytes` et `createdAt` pour former le
  `DecisionRecordV1` complet au moment de l'insertion.
- `createdAt` est une métadonnée de diagnostic produite par le main avec
  `new Date().toISOString()`. Il n'est jamais lu par une règle métier, jamais inclus dans
  le Golden Hash, jamais inclus dans `payloadSha256` ni dans `uncompressedBytes`.
- `payloadSha256` est le SHA-256 de `canonicalDecisionPayload(payload)`, où le canonicaliseur
  trie récursivement les clés et refuse `undefined`, `NaN` et l'infini. Ce canonicaliseur
  strict reste réservé à l'intégrité des enregistrements : il ne doit pas être confondu avec
  la sérialisation du noyau Golden Hash utilisée comme checksum du worker (§9).
- `uncompressedBytes` est la taille en octets UTF-8 de ce même JSON canonique de la charge
  utile. Cette définition évite une référence circulaire et rend la valeur indépendante de
  l'horloge.
- Le BLOB est `deflateSync(Buffer.from(canonicalDecisionRecord(record), 'utf8'))` : il contient
  le JSON canonique du `DecisionRecordV1` **complet**, y compris les métadonnées. À la lecture,
  le main décompresse, valide la structure, extrait la charge utile, recalcule le hash et
  vérifie l'égalité des métadonnées avec les colonnes.
- `score` est repris de la liste de candidats **réellement utilisée** par la décision :
  `interruptionScored` pour `interruption`, `scored` sinon lorsque le candidat sélectionné y
  figure. Les règles `continue_active` et `action_failed` ne réévaluent aucun score : la valeur
  est explicitement `0`. Aucun champ existant de `DecisionExplanation` n'est modifié pour
  conserver les résultats Phase 3C byte-identiques.
- `ruleIds` est l'union triée et unique de `decision.v1`, `goal.immediate.v1`, des `ruleId`
  des deltas et des `ruleId` des effets d'action. Les identifiants de règles d'échec présents
  uniquement dans le texte libre `reason` ne sont pas inférés.
- `characterName` est fourni au tick par `CharacterTickInput.characterNameByCharacterId`,
  sans influence sur les règles. À défaut, l'identifiant du personnage est utilisé.

`CharacterTickResult` gagne un tableau additif `decisionRecords: DecisionRecordPayloadV1[]`.
Le tableau `decisions` existant reste produit pour la compatibilité des tests ; les deux ne
doivent jamais diverger, y compris dans l'ordre lexicographique des identifiants.

### 3.1 Lien décision → deltas → état

Le lien est l'identifiant naturel `{world_id, tick, character_id}` :

- `explanation.selectedActionId` donne l'action retenue ;
- `actionDeltas` porte `expected` et `applied` par champ, avec le même `actionId` et le même `tick` ;
- `passiveDeltas` sont les deltas projetés bruts, avant effets d'action. Ils diffèrent des
  `passiveNeedDeltas` utilisés par le scoring, qui sont un `Record<NeedKey, number>` distinct ;
- `appliedDeltas` sont les deltas finaux du tick, dont `before` est l'état de début de tick
  et `after` l'état final aux centièmes ;
- `stateBefore` est le snapshot de début de tick (`snapshot.needs`, `snapshot.emotions`) et le
  runtime parsé avant décision ;
- `stateAfter` est exactement la paire écrite dans `characterStates[i]` et
  `actionRuntimeStates[i]`, donc égale à `current_needs_json`, `current_emotions_json` et
  `current_action_json`. Le tick n'écrit ni `current_traits_json` ni `current_goals_json` ;
- `warnings` contient les avertissements du personnage, extraits du tableau global par
  préfixe `${characterId}:`.

L'index `i` est le même pour `decisionRecords`, `decisions`, `characterStates` et
`actionRuntimeStates`, dans l'ordre lexicographique de `orderSnapshots()`.

Toute incohérence est une erreur technique, pas une correction automatique.

## 4. Modèle SQLite

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT NOT NULL
);

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
  uncompressed_bytes INTEGER NOT NULL CHECK (uncompressed_bytes BETWEEN 0 AND 65536),

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
- `character_id` n'a **pas** de clé étrangère : l'historique doit survivre à la suppression d'une instance. La garde actuelle vérifie uniquement `worlds.status === 'preparation'`, pas l'existence d'un historique. Le test de conservation insère donc directement une ligne pendant la préparation, puis supprime l'instance. L'absence de FK reste une garantie d'audit.
- `world_id` a une cascade : supprimer un monde supprime tout son historique.
- `UNIQUE(world_id, tick, character_id)` garantit exactement une décision par personnage et par tick.
- `character_name` est une copie du nom au moment de l'écriture : l'UI n'a pas besoin de joindre `characters`, et l'historique reste lisible après suppression d'une instance.
- `created_at` est une métadonnée de diagnostic produite par le store avec `new Date().toISOString()` ; aucune règle métier ne la lit et elle n'entre dans aucun hash.
- `payload_blob` est le JSON canonique complet du `DecisionRecordV1`, compressé avec `zlib.deflateSync` côté main. La compression n'affecte pas le déterminisme de la simulation ; `payload_sha256` porte sur `canonicalDecisionPayload(payload)` avant compression. Un BLOB compressé valide doit redonner, après décompression, exactement les champs `payloadSha256`, `uncompressedBytes` et `createdAt` des colonnes.
- `uncompressed_bytes` porte sur la charge utile canonique seule, sans métadonnées : la valeur est calculable dans le tick pur et indépendante de `createdAt`.
- Les colonnes `state_before_json`, `state_after_json`, `deltas_json` et `warnings_json` sont des copies de contrôle canoniques ; `deltas_json` contient `passiveDeltas`, `actionDeltas` et `appliedDeltas`. Elles permettent de détecter une divergence sans décompresser le BLOB, mais ne remplacent jamais le BLOB comme source de vérité.

## 5. Validation stricte

La validation est divisée en deux niveaux distincts.

**À l'écriture et à la lecture** :

1. structure exacte, sans clé inconnue ni valeur `undefined` ; `id === \`${explanation.worldId}:${explanation.tick}:${explanation.characterId}\``, `recordVersion === 1`, `engineVersion === 'phase3d.1'`, versions de registre/paramètres connues ;
2. SHA-256 de `canonicalDecisionPayload(payload)` égal à `payload_sha256` ; `canonicalDecisionRecord(record)` redonne exactement le JSON décompressé et `uncompressed_bytes` égal à la longueur UTF-8 du JSON canonique de la charge utile ;
3. `uncompressed_bytes <= 65536` et taille BLOB `<= 16384` ; bornes structurelles indépendantes des paramètres : au plus 19 motivations, 3 objectifs immédiats, 11 candidats, 64 identifiants d'action récents, 128 deltas et 64 avertissements ;
4. `selected_action_id` appartient à `ACTION_IDS` ; `score` est fini dans `[-5, 5]`, avec la convention explicite `0` pour `continue_active`/`action_failed` ;
5. `selection_rule` appartient à la constante runtime `DECISION_RULES` exportée par `src/shared/action.ts` (six valeurs : `score_tiebreak_rng`, `score_tiebreak_id`, `forced_idle`, `continue_active`, `interruption`, `action_failed`) ; la copie privée de `action-runtime.service.ts` est supprimée au profit de cette constante ;
6. `rng_draws` vaut 0 ou 1, `rng_state_*` sont des uint32 ;
7. toutes les valeurs `needs`/`emotions` sont finies et dans `[0, 100]`, toutes les urgences et tous les scores sont finis et dans `[0, 1]` ou `[-5, 5]` selon leur nature.

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
4. aucun backfill de `decision_records` : les décisions passées ne sont pas reconstituées par inférence. Le backfill existant des colonnes de personnages reste inchangé ;
5. les anciens `PRAGMA table_info` et `ALTER TABLE ADD COLUMN` restent actifs.

Les bases Phase 1/3A/3B/3C restent lisibles. Le premier tick après migration crée les premières lignes.

## 7. Rétention, croissance et mesures

Aucune purge automatique en 3D. Voir [PHASE_3D_DESIGN.md](PHASE_3D_DESIGN.md) §7 pour les estimations et la décision produit validée (aucun export/archivage en 3D-A).

Mesures réelles effectuées après un tick avec la génération aléatoire par défaut (un enregistrement par personnage) :

| Personnages | Enregistrements | BLOB total | BLOB moyen | BLOB min/max | Charge utile canonique moyenne |
|---|---|---|---|---|---|
| 10 | 10 | 47 592 o | 4 759,2 o | 4 641 / 4 931 o | 42 231,7 o |
| 50 | 50 | 237 752 o | 4 755,0 o | 4 386 / 5 069 o | 41 872,8 o |
| 100 | 100 | 404 895 o | 4 048,9 o | 3 381 / 5 136 o | 38 086,8 o |

**Limitation connue** : `persist()` réexporte l'intégralité de `worlds.sqlite` à chaque tick, avec double copie mémoire et double SHA-256. Le coût d'un tick croît donc avec le nombre d'enregistrements déjà stockés (3D-A : ~52 ms à ~157 ms pour 3 personnages entre les ticks 25 et 200 ; benchmarks 3D-B locaux : 63,68 ms au tick 10 et 377,56 ms au tick 200 pour 3 personnages, 548,45/1 329,12/1 652,77 ms pour 10/50/100 personnages, 1 254,09 ms/tick pour 3×10 mondes). Aucune mesure 3D-A comparable à effectif égal ne permet d'affirmer une amélioration. La 3D-B a ajouté la durabilité atomique et les verrous, pas l'optimisation : hash en flux, persistance groupée et rétention de l'historique restent à faire. Aucune purge n'est introduite. Voir [SAFE_PERSISTENCE.md](SAFE_PERSISTENCE.md) §10.

Les helpers de lecture internes sont bornés à 500 entrées (défaut 50). L'UI 3D-D applique
elle aussi une fenêtre de 50 entrées par page, avec `offset` borné à 1 000 000 : ce n'est pas
une limite de stockage.

## 8. IPC livré en 3D-D

Deux canaux de lecture uniquement :

```ts
interface DecisionHistoryQuery {
  worldId: string;          // obligatoire
  characterId?: string;
  fromTick?: number;
  toTick?: number;
  limit?: number;           // 1..500, défaut 50
  offset?: number;          // 0..1_000_000, défaut 0
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
  selectionRule: DecisionRule;
  score: number;
  reason: string;
  warningCount: number;
}

getDecisionHistory(query: DecisionHistoryQuery): Promise<DecisionSummaryView[]>;
getDecisionRecord(worldId: string, id: string): Promise<DecisionRecordV1>;
```

Les canaux sont `DECISION_HISTORY: 'decision:history'` et
`DECISION_RECORD: 'decision:record'`, enregistrés dans `src/main/ipc/decision.ipc.ts`.
Le `worldId` est obligatoire sur les deux : l'ID `${worldId}:${tick}:${characterId}` seul ne
garantit pas l'isolation entre mondes. La validation stricte des bornes, des clés et l'ordre
de tri sont décrits dans [DECISION_INSPECTOR_UI.md](DECISION_INSPECTOR_UI.md).

Aucune écriture, aucune suppression et aucun déclenchement de tick via ces canaux. Le renderer
ne voit jamais de BLOB brut : le main décompresse, vérifie checksum/version/cohérence des colonnes
et ne renvoie que des vues typées. Une ligne corrompue fait échouer toute la page. Les statements
sont libérés dans un `finally` et les erreurs zlib sont normalisées.

## 9. Tests

**Unitaires (10 tests, `tests/decision-record.test.ts`)**

- sérialisation/désérialisation `DecisionRecordV1`, sans perte des champs d'intégrité ;
- hash canonique stable, avec `DECISION_RULES` comme source runtime des six règles ;
- rejet des versions inconnues, tailles excessives, actions inconnues, règles inconnues, valeurs hors bornes ;
- compression/décompression sans perte ;
- limitation `limit` de la query, valeur par défaut 50 et maximum 500.

**Intégration SQLite (9 tests, `tests/decision-history.test.ts`)**

- une ligne par personnage et par tick sur 1 et 2 personnages ;
- écriture dans la même transaction que l'état et l'horloge ;
- hook `_setTickFailureForTests(() => { throw new Error('...'); })` : aucun enregistrement orphelin après rollback ;
- réouverture : enregistrement lisible et hash valide ;
- ancienne base sans table : migration additive réussie ;
- suppression d'un monde : cascade de l'historique ;
- suppression d'une instance : historique conservé, avec insertion directe préalable via `_insertDecisionRecordForTests()` pendant la préparation ; la garde `assertWorldPreparation` vérifie uniquement `worlds.status`, pas l'historique ;
- mesure de taille sur simulation longue.

**Lecture 3D-D (`tests/decision-read.test.ts`, `tests/decision-view.test.ts`, `tests/decision-ipc.test.ts`)**

- isolation mondes/personnages, tri `tick DESC, character_id ASC, id ASC`, pagination par `offset` ;
- projection de douze champs exactement, sans BLOB ni charge utile complète ;
- historique conservé après suppression du personnage, supprimé avec le monde ;
- checksum altéré, BLOB corrompu, version inconnue, historique vide : erreurs ou liste vide sans rendu partiel ;
- validation des bornes de requête, du format d'ID, des clés inconnues et des vues envoyées au renderer ;
- deux canaux IPC uniquement, validation dans le main avant tout appel service.

**Golden Hash (18 scénarios, `tests/decision-golden-hash.test.ts`)**

- mêmes seed/entrées/règles => même noyau canonique du calcul Phase 3C, avant et après 3D-A/3D-B et avant le futur passage au worker ; les 18 valeurs historiques restent inchangées ;
- le noyau exclut `decisionRecords`, conformément à l'arbitrage P2 : le checksum du protocole worker utilise exactement cette définition, distincte du `payloadSha256` par décision ;
- en 3D-C1, le canonicaliseur strict, `collectRuleIds()` et la sérialisation du noyau Golden Hash ont été extraits dans `src/shared/canonicalization.ts`, avec réexports depuis `decision-record.service.ts` ; les 18 hashes attendus sont inchangés ;
- chaque enregistrement produit sur ces simulations longues (jusqu'à 720 ticks) est soumis à la validation stricte, y compris la cohérence de `characterName` avec l'entrée du tick.

## 10. Hors périmètre

Événements canoniques Phase 5, souvenirs, relations, mort, LLM, génération de texte narratif, purge, export/import d'historique, paramétrage utilisateur de la verbosité.
