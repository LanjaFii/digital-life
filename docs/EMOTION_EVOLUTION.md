# Évolution des émotions — conception Phase 3B

> **Statut : implémenté en Phase 3B (services purs + intégration tick SQLite).**
> Définit les règles d'évolution des 10 émotions au tick, sans décisions autonomes.
> Les poids qualitatifs de la matrice §6 ont été convertis en coefficients numériques
> dans `simulation-parameters.service.ts` ; ils restent des hypothèses configurables.

## 1. Audit de l'existant

| Élément | État réel | Impact |
|---|---|---|
| `CharacterEmotions` (`src/shared/character.ts`) | 10 émotions 0-100 : `happiness`, `sadness`, `stress`, `anxiety`, `anger`, `fear`, `confidence`, `loneliness`, `motivation`, `satisfaction` | Toutes doivent avoir des règles explicables. |
| Besoins | 8 besoins, 100 = satisfait | Les déficits de besoins influencent les émotions, pas l'inverse en écriture directe. |
| Traits | 21 traits 0-100 | Seuls les traits pertinents influencent une émotion. |
| Tick | 1h simulée, snapshot + transaction atomique (cible) | Émotions calculées à partir du snapshot de début de tick. |

## 2. Principes

1. **Pas d'automatisme simpliste** : un besoin bas ne mappe pas 1:1 à une émotion; on utilise influences pondérées, seuils et récupération.
2. **Snapshot** : toutes les émotions lisent `snapshot.emotions`, `snapshot.traits`
   et les **besoins projetés du tick courant** (décision définitive de `CHARACTER_TICK_RULES.md` §3.2),
   jamais les besoins déjà persistés.
3. **Application différée** : les deltas émotionnels sont calculés puis appliqués ensemble; une émotion ne modifie pas une autre pendant la phase de calcul.
4. **Retour vers baseline** : chaque émotion a une baseline personnelle dérivée de traits/état initial (ou valeur neutre), avec vitesse de retour limitée.
5. **Bornes** : clamp 0-100 après calcul.
6. **Déterminisme** : pas de PRNG nécessaire en Phase 3B sauf règle explicitement justifiée (aucune retenue par défaut).
7. **Pas de boucle incontrôlée** : les influences émotion->émotion sont limitées à un seul niveau par tick via snapshot; les coefficients croisés sont petits et plafonnés.

## 3. Modèle mathématique proposé

```text
deficit_b = clamp((100 - needs_b) / 100, 0, 1)
traitFactor_t = (traits_t - 50) / 50

pressure_e = Σ w_{e,b} * f_b(deficit_b) + Σ w_{e,e2} * g_{e2}(snapshot.emotions[e2])
recovery_e = r_e * (baseline_e - snapshot.emotions[e])    // ramène vers baseline
personalityMod_e = Π(1 + k_{e,t} * traitFactor_t)

rawDelta_e = (pressure_e + recovery_e) * personalityMod_e
next_e = clamp(roundHalfEven(snapshot.emotions[e] + rawDelta_e), 0, 100)
```

- `f_b`, `g_{e2}` sont des fonctions seuil (0 sous un seuil, puis linéaire/douce). **Provisoire**.
- `baseline_e` : valeur cible par défaut, limitée dans [15,85], dérivée d'un neutre (50) + petits biais de traits. **Provisoire**.
- `r_e` : taux de retour (0.02 à 0.12/tick selon émotion), plafonné.

## 4. Baselines proposées (provisoires)

| Émotion | Neutre | Biais traits possibles | Baseline bornée |
|---|---:|---|---|
| Happiness | 55 | +optimism, +resilience, -distrust | 25..80 |
| Sadness | 25 | -optimism, -resilience | 10..60 |
| Stress | 30 | -resilience, -patience, +impulsivity | 10..70 |
| Anxiety | 25 | +timidity, +distrust, -courage, -resilience | 10..70 |
| Anger | 20 | +aggression, +impulsivity, -patience | 5..65 |
| Fear | 20 | +timidity, -courage, -resilience | 5..65 |
| Confidence | 55 | +courage, +resilience, +optimism, -timidity | 20..85 |
| Loneliness | 25 | +sociability, -independence | 5..70 |
| Motivation | 55 | +ambition, +optimism, +discipline, -resilience(low inverse) | 20..85 |
| Satisfaction | 55 | +optimism, +discipline, +resilience | 20..85 |

> Les baselines sont calculées au début du tick à partir du snapshot de traits (traits immuables Phase 3B) ; elles ne sont pas persistées séparément sauf optimisation future.

## 5. Règles par émotion

### 5.1 Happiness

- **Augmente quand** : besoins physiques/sociaux confortables (hunger/thirst/energy/sleep/hygiene/socialization > 60), satisfaction et confidence élevées.
- **Diminue quand** : déficits de besoins, sadness/stress/anxiety élevés.
- **Besoins influents** : hunger, thirst, energy, sleep, socialization, health (modéré).
- **Traits pertinents** : optimism, resilience, distrust (faible négatif).
- **Interactions** : opposée douce à sadness; freinée par stress/anxiety.
- **Récupération** : retour lent vers baseline; resilience augmente vitesse.

### 5.2 Sadness

- **Augmente quand** : socialization bas, health bas, loneliness élevé, happiness basse prolongée.
- **Diminue quand** : besoins rétablis, happiness/confidence remontent.
- **Besoins influents** : socialization, health, energy, sleep.
- **Traits pertinents** : optimism, resilience.
- **Interactions** : peut augmenter loneliness perçue; diminue motivation/satisfaction légèrement.
- **Récupération** : plus lente que stress aigu; resilience/optimism accélèrent.

### 5.3 Stress

- **Augmente quand** : hunger/thirst/energy/sleep/safety bas; anxiety/fear élevés.
- **Diminue quand** : besoins stabilisés, safety élevée, repos.
- **Besoins influents** : sleep, energy, hunger, thirst, safety.
- **Traits pertinents** : resilience, patience, impulsivity, discipline (faible).
- **Interactions** : alimente anxiety; réduit happiness/satisfaction.
- **Récupération** : retour moyen vers baseline; resilience forte.

### 5.4 Anxiety

- **Augmente quand** : safety bas, health bas, stress élevé, incertitude future (non modélisée Phase 3B, donc faible).
- **Diminue quand** : safety/health remontent, confidence haute.
- **Besoins influents** : safety, health, sleep.
- **Traits pertinents** : timidity, distrust, courage, resilience.
- **Interactions** : nourrit stress/fear; réduit confidence/motivation.
- **Récupération** : lente; courage/resilience accélèrent.

### 5.5 Anger

- **Augmente quand** : besoins bloqués (hunger/thirst/sleep/safety) avec frustration; injustice/événements futurs hors périmètre.
- **Diminue quand** : besoins rétablis, temps.
- **Besoins influents** : hunger, thirst, sleep, safety.
- **Traits pertinents** : aggression, impulsivity, patience, empathy (faible tampon).
- **Interactions** : peut augmenter stress; réduit happiness/satisfaction.
- **Récupération** : relativement rapide vers baseline si déclencheur absent; patience aide.

### 5.6 Fear

- **Augmente quand** : safety bas, health très bas, anxiety élevée.
- **Diminue quand** : safety remonte, confidence/courage contextuel.
- **Besoins influents** : safety, health.
- **Traits pertinents** : timidity, courage, resilience, distrust.
- **Interactions** : alimente stress/anxiety; réduit confidence.
- **Récupération** : moyenne; resilience/courage accélèrent.

### 5.7 Confidence

- **Augmente quand** : besoins satisfaits, motivation/satisfaction élevées, stress/anxiety bas.
- **Diminue quand** : fear/anxiety/stress élevés, health/safety bas.
- **Besoins influents** : health, safety, energy, sleep.
- **Traits pertinents** : courage, resilience, optimism, timidity.
- **Interactions** : inverse partielle de fear/anxiety; soutient motivation.
- **Récupération** : lente à remonter, peut baisser plus vite sous pression (asymétrie **provisoire**).

### 5.8 Loneliness

- **Augmente quand** : socialization bas.
- **Diminue quand** : socialization haut (futur via interactions; Phase 3B seulement si besoin remonte par règle future, sinon stable/hausse).
- **Besoins influents** : socialization (principal).
- **Traits pertinents** : sociability, independence.
- **Interactions** : augmente sadness, réduit happiness.
- **Récupération** : lente; independence réduit amplitude.

### 5.9 Motivation

- **Augmente quand** : energy/sleep/health corrects, confidence/satisfaction élevées.
- **Diminue quand** : fatigue, stress, sadness, besoins critiques.
- **Besoins influents** : energy, sleep, health, hunger (modéré).
- **Traits pertinents** : ambition, optimism, discipline, resilience.
- **Interactions** : soutient satisfaction future; réduite par sadness/stress.
- **Récupération** : moyenne.

### 5.10 Satisfaction

- **Augmente quand** : besoins globalement satisfaits, stress bas, motivation/confidence correctes.
- **Diminue quand** : déficits persistants, stress/sadness élevés.
- **Besoins influents** : tous, avec poids plus forts sur hunger/thirst/sleep/energy/safety.
- **Traits pertinents** : optimism, discipline, resilience.
- **Interactions** : proche de happiness mais plus évaluative/stable.
- **Récupération** : lente, dépend de stabilité globale.

## 6. Matrice influences besoin -> émotion (provisoire)

Légende : `++` fort, `+` moyen, `~` faible, vide = non retenu par défaut.

| Besoin \ Émotion | Hap | Sad | Str | Anx | Ang | Fea | Con | Lon | Mot | Sat |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Hunger | - | ~ | + | ~ | + |  | ~ |  | - | - |
| Thirst | - | ~ | + | ~ | + |  | ~ |  | - | - |
| Energy | - | + | ++ | ~ | ~ |  | - |  | -- | - |
| Sleep | - | + | ++ | + | + | ~ | - |  | -- | - |
| Health | - | + | + | ++ | ~ | + | - |  | - | - |
| Hygiene | ~ | ~ | ~ |  | ~ |  | ~ |  | ~ | ~ |
| Socialization | - | ++ | ~ | ~ |  |  | ~ | ++ | ~ | - |
| Safety | - | ~ | ++ | ++ | + | ++ | -- |  | - | -- |

> Matrice de départ convertie en coefficients numériques dans `SimulationParametersV1` :
> `++ ≈ ±0.8`, `+ ≈ ±0.4`, `~ ≈ ±0.2` (besoins), "`--` ≈ ±0.5" (confort).
> Ces valeurs restent des **hypothèses configurables**, pas des vérités calibrées.
> Les signes indiquent le sens de l'effet quand le besoin est bas.

## 7. Anti-boucles et garde-fous

- **Pas d'écriture croisée pendant le calcul** : émotions lisent le snapshot, écrivent des deltas.
- **Plafond de pression totale** : `pressure_e` borné à `[-8, +8]` pts/tick (`caps.emotionPressure`). Configurable.
- **Plafond de delta final** : `[-10, +10]` pts/tick (`caps.emotionDelta`). Configurable.
- **Anti-saturation (décision Phase 3B)** : la pression **positive** issue du confort est plafonnée
  par la marge restante vers la baseline personnelle. Sans cette garde-fou, un scénario stable
  saturait `happiness` à 100 en ~50 ticks (observé en simulation longue). La pression
  **négative** (déficits persistants) reste libre : elle doit pouvoir abaisser durablement
  l'émotion. Cause associée : `clamp / baseline.headroom`.
- **Récupération minimale** : zone morte `|baseline-current| < 0.5` (`emotionDeadZone`). Configurable.
- **Couplage émotion->besoin** : en Phase 3B, limité à stress/anxiety influençant sleep/energy/safety faiblement, avec plafonds stricts.

## 8. Tests à prévoir

- Bornes 0-100 sur 10 000 ticks.
- Déterminisme snapshot+seed.
- Un déficit socialization isolé augmente loneliness puis sadness, pas anger.
- Resilience élevée récupère plus vite de stress qu'un profil peu résilient, à état identique.
- Aucun delta > plafond configuré.
- Pas d'oscillation artificielle sur personnage stable (variance bornée).
