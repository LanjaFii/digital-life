# Moteur de simulation — [Planifié, phase 3]

## Principe

Le moteur est indépendant de l'interface. Il s'exécute dans un worker thread du
processus principal et communique par messages : commandes (`start`, `pause`,
`speed`, `step`, `stop`) et événements (`cycle`, `event`, `error`, `state`).

## Cycle (16 étapes)

1. Avancer le temps (jour, heure, cycle).
2. Actualiser les besoins.
3. Actualiser les émotions (avec régulation).
4. Évaluer les objectifs.
5. Consulter les souvenirs pertinents.
6. Calculer les actions possibles selon le contexte et les ressources.
7. Évaluer chaque action (besoins, traits, émotions, objectifs, relations, mémoire).
8. Sélectionner la décision avec PRNG seedé et composante probabiliste contrôlée.
9. Exécuter l'action.
10. Gérer les interactions entre agents.
11. Calculer les conséquences.
12. Générer les événements émergents.
13. Actualiser les relations.
14. Actualiser les souvenirs (consolidation, oubli).
15. Vérifier les décès.
16. Persister les changements (incrémental + snapshots périodiques).

## Décisions explicables

Chaque décision importante enregistre un objet `DecisionExplanation` : score des
actions, facteurs dominants, état du PRNG, cycle, action retenue. Ces explications
sont consultables dans la fiche personnage (onglet Historique, phase 7).

## Anti-boucles

- Cooldown par action et par personnage.
- Historique glissant des dernières actions.
- Bonus de exploration contrôlé après répétition excessive.
- Score initialisé avec le contexte spatial et les ressources disponibles.

## Reproductibilité

Chaque monde possède une seed. Le PRNG métier est séparé du générateur utilisé
pour les dialogues LLM, afin qu'une réponse du LLM ne modifie jamais une décision.

## Paramètres (défauts proposés)

| Paramètre | Défaut |
|---|---|
| Durée d'un cycle | 60 s réelles (configurable) |
| Durée d'une journée simulée | 24 cycles |
| Vitesse initiale | 1x (1x, 2x, 5x, 10x) |
| Sauvegarde auto | toutes les 50 cycles |
| Limite d'événements en mémoire UI | 500 (file circulaire) |
