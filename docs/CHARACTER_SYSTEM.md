# Système de personnages — [Planifié, phase 2]

Un personnage est un agent autonome complet, pas une fiche à trois statistiques.

## Identité

ID, nom, prénom, âge, date de naissance, sexe fictif, description, biographie,
profession, statut (ALIVE/DEAD), date de création.

## Personnalité

Traits numériques 0-100 : introversion, extraversion, empathie, agressivité,
patience, impulsivité, curiosité, intelligence, créativité, honnêteté, altruisme,
égoïsme, ambition, courage, timidité, méfiance, sociabilité, sensibilité,
résilience, humour, jalousie, tolérance, discipline, optimisme, pessimisme,
besoin de contrôle, indépendance, loyauté.

Big Five : ouverture, conscienciosité, extraversion, agréabilité, neuroticisme.
L'extraversion est partagée avec la liste ci-dessus : une seule valeur est stockée
et réutilisée, pour éviter les doublons conceptuels dans les calculs.

## Émotions et régulation

Bonheur, tristesse, stress, anxiété, colère, peur, confiance, solitude,
motivation, satisfaction, sécurité, fatigue mentale. Chaque émotion possède une
valeur 0-100, une vitesse de retour à la ligne de base et des interactions
(ex. : la tristesse réduit la motivation). La régulation dépend de la résilience,
du sommeil et du soutien social.

## Besoins

Faim, soif, énergie, sommeil, santé, hygiène, socialisation, sécurité, repos.
Ils dérivent avec le temps selon l'activité, le lieu et les ressources disponibles.
Un besoin critique génère une forte pression sur la décision.

## Préférences et objectifs

Activités favorites/détestées, nourriture, lieux, types de personnalité appréciés
ou évités, préférences sociales, peurs. Objectifs courts, moyens et longs terme,
avec progression et possibilité de remplacement.

## Personnalité évolutive

Les traits changent par petites valeurs (par exemple +1 de méfiance après une
trahison), jamais de façon arbitraire. Chaque modification est journalisée avec
sa cause et son cycle.
