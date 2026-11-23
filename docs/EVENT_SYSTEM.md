# Système d'événements — [Planifié, phase 3/4]

## Structure

ID, date, type, participants, lieu, description, cause, conséquences, importance,
état de traitement (`pending`, `processed`, `resolved`).

## Types initiaux

Rencontre, amitié, dispute, réconciliation, trahison, jalousie, amour, rupture,
accident, maladie, blessure, découverte d'un secret, aide inattendue, acte de
courage, acte de lâcheté, solitude, crise psychologique, mort, conversation.

## Émergence et cascades

Les événements résultent d'actions et de changements d'état, jamais d'un tirage
arbitraire isolé. Un événement peut en produire d'autres via des règles de
conséquence : une insulte réduit la confiance de la victime, un témoin perd du
respect pour l'agresseur, un récit propagé peut créer une rivalité.

## Journal et filtres

[Planifié, phase 7] le journal affiche les événements en temps réel avec filtres :
tous, relations, émotions, conflits, accidents, décès, conversations.

## Ajouter un type d'événement

1. Ajouter le type dans l'union `EventType` (phase 3).
2. Déclarer ses règles de conséquence dans `src/main/simulation/event-rules.ts`.
3. Ajouter un libellé de filtre dans le renderer si nécessaire.
4. Écrire un test unitaire vérifiant la cascade.
