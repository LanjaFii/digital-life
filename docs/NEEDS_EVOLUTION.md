# Évolution des besoins — conception Phase 3B

> **Statut : implémenté en Phase 3B (services purs + intégration tick SQLite).**
> Ce document définissait les règles d'évolution des 8 besoins au tick. Les règles sont
> désormais opérationnelles dans `needs-evolution.service.ts`, avec les coefficients
> versionnés de `simulation-parameters.service.ts`. Le moteur, le worker, le schéma SQLite,
> l'UI et les IPC restent inchangés.

## 1. Audit de l'existant (réel)

| Élément | État réel | Impact |
|---|---|---|
| `CharacterNeeds` (`src/shared/character.ts`) | 8 besoins, `0-100`, commentaire `100 = besoin satisfait` : `hunger`, `thirst`, `energy`, `sleep`, `health`, `hygiene`, `socialization`, `safety` | Convention à conserver. |
| `currentState` / `initialState` | Les deux existent sur `CharacterInstance`; en préparation ils sont alignés, après démarrage `initialState` doit rester immuable (contrat Phase 2). | Les deltas s'appliquent uniquement à `currentState`. |
| `SimulationClock` | `tick`, `day`, `hour`, `rngState` uint32, 1 tick = 1h, 24 ticks/jour. | Les coefficients sont définis **par tick (1h simulée)**. |
| `stepSimulation` (Phase 3A) | Avance seulement l'horloge dans une transaction SQLite + `persist`. | Phase 3B devra étendre cette transaction, pas créer un flux parallèle. |
| PRNG | `SeededRng` sérialisable ; domaine simulation séparé (`world.seed ^ 0x85ebca6b`). | N'utiliser le PRNG que si une règle l'exige explicitement. |
| Déterminisme | Snapshot/rejeu exigés par la conception Phase 2/3A. | Aucun `Date.now()`, aucun `Math.random()`, ordre stable. |

## 2. Convention et modèle mathématique

### 2.1 Convention

- **Échelle** : `0..100`, **décimal contrôlé à 2 décimales (centièmes)** en persistance.
  Décision définitive Phase 3B : le stockage en entiers ferait disparaître des deltas
  comme `-0.05` ou `-0.5` et provoquerait une stagnation artificielle. Les colonnes JSON
  existantes acceptent déjà des `number` ; aucun changement de schéma n'était nécessaire.
- **Sens** : `100 = besoin satisfait/comblé`, `0 = besoin critique/vide`.
- **Tick** : 1 tick = 1 heure simulée. Les taux ci-dessous sont des points par tick sauf mention contraire.

### 2.2 Formule générale (proposée)

Pour un besoin `b` au tick `T` :

```text
baselineDelta_b = -decay_b
personalityMod_b = Π(1 + k_{b,t} * traitFactor_t)   // produit borné, traits pertinents seulement
needInteractionMod_b = Σ i_{b,n} * deficit_n           // deficits d'autres besoins
recovery_b = recoveryRule_b(snapshot, context)        // 0 en Phase 3B sauf règles passives très limitées
raw_b = snapshot.needs[b] + baselineDelta_b * personalityMod_b + needInteractionMod_b + recovery_b
next_b = clamp(roundHalfEven(raw_b), 0, 100)
```

- `deficit_n = (100 - snapshot.needs[n]) / 100` ∈ [0,1].
- `traitFactor_t = (snapshot.traits[t] - 50) / 50` ∈ [-1,1].
- `roundHalfEven` : **décision définitive** — arrondi bancaire symétrique (`roundHalfEven(-1.5) = -2`,
  contrairement à `Math.round`). Appliqué via `quantize(value, 2)` aux centièmes.
  Évite le biais asymétrique de `Math.round()` sur les valeurs négatives.
- **Saturation** : `clamp` après calcul complet du tick, jamais pendant les calculs inter-besoins (les interactions lisent le snapshot).

### 2.3 Décision de conception

| Décision | Statut | Justification |
|---|---|---|
| Calcul sur snapshot début de tick | Définitif | Déterminisme, indépendance de l'ordre de traitement. |
| Pas de PRNG pour la dérive naturelle | Définitif | Aucun besoin d'aléa pour une dérive horaire ; reproductibilité maximale. |
| `100 = satisfait` | Définitif | Contrat existant. |
| Taux par tick (1h) | Définitif | Aligné sur `SimulationClock`. |
| Coefficients numériques | Configurables (`SimulationParametersV1`) | Hypothèses documentées, conservées telles quelles ; simulées sur 24/72/168/720/3000 ticks. |
| Précision décimale (centièmes) | **Définitif** | Évite la stagnation des petits deltas ; compatible avec les types `number` existants. |
| Arrondi half-even | **Définitif** | Symétrique pour positifs/négatifs ; testé sur les cas limites. |

## 3. Règles par besoin

> Les traits listés sont les **traits pertinents**. L'absence d'un trait signifie qu'il n'influence pas la règle (évite les règles artificielles).

### 3.1 Hunger (faim)

- **Sens** : satiété alimentaire. 100 = rassasié, 0 = affamé critique.
- **Évolution naturelle** : décroissance lente régulière. Proposition : `-0.8 / tick` (≈ 19 pts/jour, vide en ~5 jours sans récupération).
- **Influences personnalité** :
  - `discipline` (+) : réduit légèrement la dérive perçue/comportementale passive (modeste) ; **provisoire, faible** car pas d'action.
  - `impulsivity` (-) : augmente légèrement la dérive (représente moins de régularité passive). Influence faible pour éviter caricature.
- **Interactions** : `energy` très bas (<20) augmente légèrement la pénibilité mais pas la décroissance directe en Phase 3B ; `health` très bas peut accélérer faiblement (`+0.1`/tick max). **Provisoire**.
- **Seuils** :
  - `< 60` : gêne légère (future influence humeur).
  - `< 35` : faim importante.
  - `< 15` : critique (futur déclencheur comportement/mort, **non implémenté**).
- **Récupération** : aucune automatique en Phase 3B (nécessite action future "manger").
- **Notes** : ne pas confondre faim et soif ; pas de récupération passive.

### 3.2 Thirst (soif)

- **Sens** : hydratation. 100 = hydraté, 0 = déshydratation critique.
- **Évolution naturelle** : décroissance plus rapide que la faim. Proposition : `-1.6 / tick` (≈ 38 pts/jour).
- **Influences personnalité** : `discipline` faible effet protecteur ; `impulsivity` faible effet aggravant. Influences plus petites que hunger.
- **Interactions** : `health < 30` peut accélérer légèrement. Température/environnement hors périmètre actuel.
- **Seuils** : `< 50` gêne, `< 25` important, `< 10` critique (futur).
- **Récupération** : aucune automatique en Phase 3B.
- **Notes** : besoin plus urgent que hunger ; coefficients à calibrer pour éviter mort implicite trop rapide.

### 3.3 Energy (énergie)

- **Sens** : énergie disponible pour agir. 100 = énergique, 0 = épuisé.
- **Évolution naturelle** : décroissance modérée en éveil. Proposition : `-1.0 / tick`.
- **Influences personnalité** :
  - `resilience` (+) : réduit légèrement la perte (`k` faible).
  - `discipline` (+) : petite réduction (gestion régulière).
  - `impulsivity` (-) : petite augmentation de dépense passive.
- **Interactions** : `sleep < 30` augmente la perte (`+0.4`/tick max) ; `hunger < 25` ou `thirst < 25` augmente la perte (`+0.2`/tick chacun, plafonné). `health < 30` augmente la perte.
- **Seuils** : `< 40` fatigué, `< 20` épuisé, `< 10` critique.
- **Récupération** : repos/sommeil futur. En Phase 3B, pas de récupération active ; on peut prévoir une micro-récupération passive seulement si `sleep` est très élevé et aucun autre besoin critique - **provisoire, désactivé par défaut** pour éviter les personnages éternellement stables.

### 3.4 Sleep (sommeil/repos)

- **Sens** : pression de sommeil / repos suffisant. 100 = reposé, 0 = privation sévère.
- **Évolution naturelle** : décroissance lente pendant les heures d'éveil simulées. Proposition : `-0.9 / tick`.
- **Influences personnalité** :
  - `discipline` (+) : meilleure hygiène de sommeil future ; en Phase 3B effet passif très faible ou nul.
  - `anxiety` (émotion) n'est pas un trait mais influence la récupération future ; `timidity`/`distrust` non utilisés directement ici pour éviter règle artificielle.
- **Interactions** : `stress > 70` ou `anxiety > 70` accélère la dégradation (`+0.2`/tick max). `energy < 20` indique pression forte mais ne double pas la décroissance.
- **Seuils** : `< 40` somnolent, `< 20` privation importante, `< 10` critique.
- **Récupération** : action dormir future. Pas de récupération automatique en Phase 3B.

### 3.5 Health (santé)

- **Sens** : état physique général. 100 = bonne santé, 0 = critique.
- **Évolution naturelle** : quasi stable à court terme. Proposition : `0 / tick` par défaut, avec pénalités si autres besoins critiques.
- **Influences personnalité** :
  - `resilience` (+) : réduit la perte quand conditions mauvaises.
  - `discipline` (+) : très faible effet protecteur.
- **Interactions** : pertes conditionnelles si besoins critiques prolongés :
  - `hunger < 15` : `-0.3/tick`
  - `thirst < 10` : `-0.8/tick`
  - `sleep < 15` : `-0.2/tick`
  - `hygiene < 15` : `-0.1/tick`
  - plafonner la perte totale santé à `-1.2/tick` en Phase 3B.
- **Seuils** : `< 50` fragile, `< 25` mauvaise santé, `< 10` critique (futur déclencheur mort, **non implémenté**).
- **Récupération** : très lente, seulement si besoins primaires > 60. Proposition provisoire : `+0.05/tick` si hunger/thirst/sleep/energy > 60 et health < 90. À calibrer prudemment.

### 3.6 Hygiene (hygiène)

- **Sens** : propreté/confort corporel. 100 = propre, 0 = très dégradé.
- **Évolution naturelle** : décroissance lente. Proposition : `-0.5 / tick`.
- **Influences personnalité** :
  - `discipline` (+) : réduit la dérive.
  - `impulsivity` (-) : peut l'augmenter légèrement.
- **Interactions** : `health < 25` peut accélérer légèrement. Pas d'autre couplage fort.
- **Seuils** : `< 40` inconfort, `< 20` dégradé, `< 10` critique social/santé futur.
- **Récupération** : action laver/nettoyer future. Pas de récupération automatique.

### 3.7 Socialization (socialisation)

- **Sens** : besoin de contact social satisfait. 100 = socialement comblé, 0 = isolement fort.
- **Évolution naturelle** : décroissance modérée. Proposition : `-0.6 / tick`.
- **Influences personnalité** :
  - `sociability` (fort) : forte sociabilité => décroissance plus rapide; faible sociabilité => plus lente.
  - `independence` (+) : réduit la décroissance.
  - `empathy` non utilisé directement pour la décroissance (pertinent en interactions futures).
- **Interactions** : `loneliness` (émotion) est une conséquence, pas une cause directe ici; éviter boucle directe besoin<->émotion dans le même calcul. `safety < 20` peut légèrement augmenter besoin social ou l'inhiber selon modèle - **incertain, désactivé en Phase 3B**.
- **Seuils** : `< 40` manque social, `< 20` isolement, `< 10` critique.
- **Récupération** : interactions sociales futures. Pas de récupération automatique.

### 3.8 Safety (sécurité)

- **Sens** : sentiment de sécurité matérielle/physique/environnementale. 100 = en sécurité, 0 = danger perçu fort.
- **Évolution naturelle** : **décision tranchée** — `0 / tick` avec retour lent (`+0.2/tick`, modulé par
  `resilience`) vers une baseline personnelle de 65 quand aucun facteur négatif n'est actif.
  L'alternative `-0.1/tick` était artificielle sans événement modélisé.
- **Influences personnalité** :
  - `courage` (+) : atténue les pertes, favorise stabilité.
  - `timidity` (-) : augmente sensibilité aux pertes.
  - `distrust` (-) : dégrade légèrement ou ralentit récupération.
  - `resilience` (+) : récupération/stabilité.
- **Interactions** : `health < 20` réduit safety; événements futurs principaux. `anxiety` élevée peut tirer safety vers le bas faiblement (prudence : couplage émotion->besoin à plafonner).
- **Seuils** : `< 50` vigilance, `< 25` insécurité, `< 10` critique.
- **Récupération** : environnement stable; retour lent vers baseline personnelle (ex. 65) si pas de menace. Proposition : `+0.2/tick` quand en dessous de baseline et aucun facteur négatif.

## 4. Matrice de traits pertinents (besoins)

| Besoin | Traits pertinents | Traits explicitement non utilisés par défaut |
|---|---|---|
| Hunger | discipline, impulsivity | la plupart des autres |
| Thirst | discipline, impulsivity | la plupart des autres |
| Energy | resilience, discipline, impulsivity | sociability, creativity, etc. |
| Sleep | discipline (faible) | timidity/distrust (pas directement) |
| Health | resilience, discipline | aggression, humor, etc. |
| Hygiene | discipline, impulsivity | curiosity, loyalty, etc. |
| Socialization | sociability, independence | aggression, courage, etc. |
| Safety | courage, timidity, distrust, resilience | humor, creativity, etc. |

> Règle : n'ajouter un trait que si un mécanisme causal plausible est explicable et testable.

### 4.1 Inventaire complet des 21 traits

Tous les traits existants ont été examinés. Un trait absent des formules Phase 3B n'est pas oublié : il est **volontairement exclu** tant qu'aucun mécanisme causal explicable et testable ne justifie son usage (évite les règles artificielles et le sur-déterminisme).

| Trait | Utilisé en Phase 3B | Rôle / raison de l'exclusion |
|---|---|---|
| sociability | Oui (socialization ; émotions loneliness/sadness) | Module la vitesse de degradation du besoin social. |
| empathy | Oui (émotion anger, tampon faible) | Pertinent surtout en interactions futures. |
| aggression | Oui (émotion anger) | Réactivite colérique ; pas d'effet direct sur les besoins. |
| patience | Oui (émotions anger/stress) | Tolérance a la frustration. |
| impulsivity | Oui (besoins, anger/stress) | Irregularite passive, reactivite. Effets volontairement faibles. |
| curiosity | Non | Aucun lien causal direct avec dérive de besoin ou humeur de base ; pertinent pour exploration future. |
| intelligence | Non | Aucun mécanisme plausible de dérive horaire ; agirait comme un coefficient arbitraire. |
| creativity | Non | Sans expression/action modélisée, aucun effet explicable sur besoins/émotions. |
| honesty | Non | Trait social/moral, sans effet sur la physiologie en Phase 3B. |
| altruism | Non | Ne s'exprime que via interactions futures (Phase 4+). |
| ambition | Oui (émotion motivation) | Nourrit la motivation, pas la dérive des besoins. |
| courage | Oui (safety ; émotions anxiety/fear/confidence) | Attenue la peur et la sensibilité a l'insécurité. |
| timidity | Oui (safety ; émotions anxiety/fear/confidence) | Sensibilité accrue a l'insécurité et a la peur. |
| distrust | Oui (safety ; émotions anxiety/happiness) | Vigilance et méfiance accrues. |
| optimism | Oui (émotions happiness/sadness/confidence/motivation) | Accélère la récupération émotionnelle. |
| humor | Non | Aucun événement/commentaire modélisé ; effet humoristique non mesurable en Phase 3B. |
| jealousy | Non | Nécessite relations/comparaison sociales (Phase 4+). |
| discipline | Oui (besoins ; émotions stress/satisfaction) | Régularité passive, effet faible par choix de design. |
| independence | Oui (socialization ; émotion loneliness) | Réduit l'impact de l'isolement. |
| loyalty | Non | Nécessite relations (Phase 4+) ; aucun effet sur état interne seul. |
| resilience | Oui (besoins ; presque toutes les émotions) | Récupération et stabilité, levier principal de différenciation. |

> Les traits marqués « Non » pourront être introduits plus tard **uniquement** avec une règle documentée et un test de calibration dédié. Voir `docs/EMOTION_EVOLUTION.md` pour leurs équivalents émotionnels et `docs/CHARACTER_TICK_RULES.md` §9 pour le statut des décisions.

## 5. Seuils critiques et conséquences futures

| Seuil | Signification | Effet Phase 3B | Effet futur (non implémenté) |
|---|---:|---|---|
| >= 60 | confortable | aucun | - |
| 35-59 | gêne | influence émotionnelle modérée | actions possibles |
| 15-34 | important | influence émotionnelle forte | priorisation décisionnelle |
| < 15 | critique | alerte interne/log explicable | actions urgentes, risque santé/mort selon besoin |

**Aucune mort en Phase 3B.** Les seuils critiques sont documentés seulement.

## 6. Calibration provisoire (à tester)

Hypothèse de départ "personnage moyen, sans action" :

| Besoin | Delta/tick | ~Jours à 0 depuis 100 | Commentaire |
|---|---:|---:|---|
| Hunger | -0.8 | 5.2 j | gérable, pas immédiat |
| Thirst | -1.6 | 2.6 j | plus urgent |
| Energy | -1.0 | 4.2 j | dépendra du sommeil futur |
| Sleep | -0.9 | 4.6 j | dépendra du cycle futur |
| Health | 0 (conditionnel) | N/A | stable sauf négligence critique |
| Hygiene | -0.5 | 8.3 j | lent |
| Socialization | -0.6 | 6.9 j | modulé par sociability |
| Safety | -0.1 ou retour baseline | N/A | surtout événementiel futur |

Ces valeurs sont **provisoires**. Elles doivent être validées par simulation longue avant implémentation.

## 7. Limites connues

- Sans actions, tous les besoins décroissants atteindront des zones critiques : c'est attendu avant Phase 3C (décisions/actions). Les tests de calibration doivent mesurer la vitesse, pas "l'équilibre éternel sans action".
- Les couplages émotion->besoin (stress impactant sleep) créent un risque de boucle ; les appliquer avec plafond et sur snapshot.
- `safety` est difficile sans événements/environnement ; garder un modèle minimal en Phase 3B.

## 8. Tests (implémentés en Phase 3B)

- Bornes 0-100 respectées sur 3000 ticks (horizons 24/72/168/720/3000 couverts).
- Même snapshot + seed => mêmes deltas.
- Aucun PRNG consommé si règles passives pures.
- Hunger/thirst décroissent plus vite avec profils impulsifs (faible écart) qu'avec disciplinés, à état initial égal.
- Health ne décroît pas quand besoins primaires sont confortables.
- Socialization décroît plus vite pour sociability élevée que faible, à indépendance égale.
