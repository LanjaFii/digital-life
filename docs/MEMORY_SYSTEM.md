# Système de mémoire — [Planifié, phase 4]

## Deux niveaux

- **Court terme** : rencontres, discussions, actions récentes, conflits, expériences.
  Fenêtre glissante, purge après N cycles.
- **Long terme** : traumatismes, amitiés, trahisons, moments heureux, pertes,
  réussites, échecs. Persistante dans SQLite.

## Structure d'un souvenir

ID, date, type, description, participants, importance (0-100), valence
émotionnelle (-100 à +100), intensité, personnes associées, cycle de création.

## Consolidation et oubli

À chaque consolidation, l'importance effective est recalculée :
`importance × facteur de récence × renforcement`. Les souvenirs non renforcés
sous un seuil sont oubliés ; les traumatismes et moments heureux importants
résistent. Les souvenirs oubliés ne sont pas supprimés brutalement : ils passent
par un état `faded` conservant une trace minimale.

## Influence sur les décisions

Le moteur ne sélectionne qu'un petit nombre de souvenirs pertinents (participants,
type, valence, récence) et les injecte dans le score des actions. Un souvenir de
trahison peut faire baisser la confiance et rendre l'action « éviter » plus probable.

## LLM

Seuls les souvenirs sélectionnés sont envoyés au LLM pour contextualiser un
dialogue. La mémoire complète n'est jamais transmise.
