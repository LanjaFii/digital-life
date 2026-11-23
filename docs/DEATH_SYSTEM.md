# Système de mort — [Planifié, phase 5]

## Permanent

Le statut passe à `DEAD`. L'agent ne prend plus de décision, ses besoins ne
sont plus actualisés. Profil, relations et mémoire sont conservés.

## Causes cohérentes

Vieillesse, maladie, accident, blessure grave, faim, déshydratation, conditions
environnementales. Aucun tirage arbitraire : chaque cause découle d'un état
suivi (santé, besoins, âge, événement). Le suicide n'est pas implémenté.

## Lors d'un décès

- Création d'un événement de mort dans le journal.
- Réactions émotionnelles différenciées selon le lien, la personnalité et les souvenirs.
- Évolution des objectifs des survivants (protection, vengeance, solitude, etc.).
- Inscription dans le registre des décès.
- Période de deuil avec décroissance progressive de la tristesse selon la résilience.

## Tests prévus

Vérifier qu'aucun décès n'est arbitraire, que la simulation continue, que les
données du défunt restent lisibles après rechargement.
