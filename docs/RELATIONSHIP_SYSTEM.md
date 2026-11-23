# Système de relations — [Planifié, phase 4]

## Modèle

Une relation est **directionnelle** : `A → B` est stockée indépendamment de `B → A`.
Chaque relation contient : amitié, confiance, affection, respect, attirance,
rivalité, hostilité, peur, ressentiment (0-100), ainsi qu'un historique des
changements.

## Types dérivés

Inconnus, connaissances, amis, amis proches, meilleurs amis, amoureux, en couple,
rivaux, ennemis. Le type est calculé à partir des valeurs et de l'historique.

## Dynamique

- Une trahison diminue fortement confiance et respect, augmente ressentiment.
- Une aide inattendue augmente amitié, confiance et affection.
- Une relation peut se dégrader lentement par manque d'interaction.
- Des événements observables par un tiers modifient le respect envers l'auteur.

## Visualisation

[Planifié, phase 7] graphe interactif : nœuds = personnages, arêtes = relations,
couleur selon le type, épaisseur selon l'intensité, clic = fiche détaillée.
