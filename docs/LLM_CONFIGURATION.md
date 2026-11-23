# Configuration OpenRouter — [Planifié, phase 6]

## Deux modes

- **Classique** (défaut) : dialogues construits à partir de modèles de phrases,
  d'intentions et de contextes. Fonctionne hors ligne.
- **Enrichi** : OpenRouter génère uniquement les dialogues. Le moteur garde la
  responsabilité exclusive des décisions, relations, émotions, actions,
  conséquences, décès et traits.

## Paramètres

| Paramètre | Valeur initiale |
|---|---|
| API key | définie par l'utilisateur, chiffrée via `safeStorage` |
| Modèle | `nvidia/nemotron-3-ultra-550b-a55b:free` |
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` |
| Temperature | 0.8 |
| Max tokens | 256 |
| Timeout | 15 s |
| Requêtes simultanées max | 2 |

Le modèle, l'endpoint et les autres paramètres sont entièrement configurables.

## Sécurité

- La clé est chiffrée via Electron `safeStorage` et stockée dans `data/settings/`.
- Jamais de clé dans le renderer, SQLite, les logs ou le code source.
- Si `safeStorage` est indisponible, l'application affiche une explication claire
  et propose un fichier local chiffré par mot de passe (solution documentée, jamais
  de stockage en clair).

## Activation / désactivation

Bouton LLM ON/OFF dans le dashboard : changement instantané, sans redémarrage,
sans perte de mémoire, sans interruption du temps. L'API n'est appelée que lors
d'une interaction sociale pertinente, via une file asynchrone limitée.

## Panne API

La simulation continue avec un dialogue classique ; l'erreur technique est
enregistrée et l'utilisateur est informé sans interruption de la partie.
