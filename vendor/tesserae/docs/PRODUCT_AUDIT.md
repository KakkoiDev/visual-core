# Tesserae — audit produit et contrat de livraison

## Vision

Tesserae doit supprimer le travail répétitif situé entre « j’ai peint une matière » et « je peux construire un niveau dans Godot ». Le test produit n’est donc pas le nombre de paramètres disponibles, mais la réponse à ces cinq questions :

1. Puis-je fabriquer une famille complète de tuiles sans corriger 47 raccords à la main ?
2. Puis-je conserver exactement les pixels et les transparences de mes falaises ?
3. Puis-je savoir avant Godot si le terrain va casser visuellement ?
4. Puis-je envoyer le résultat dans mon projet sans reconstruire le TileSet ?
5. Puis-je réutiliser les mêmes morceaux de level design sans produire une carte monotone ?

## Parcours cible

Le parcours principal est désormais :

`peindre la matière → tester une forme → corriger les coutures → composer des morceaux réutilisables → voir “Prêt pour Godot” → installer`

Les mots liés aux formats de fichiers, aux bits de voisinage et aux couches internes de Godot sont relégués dans les réglages avancés.

## Fonctions déployées

| Besoin du game designer | Réponse Tesserae | Preuve actuelle |
|---|---|---|
| Ne pas dessiner 47 tuiles | Génération Blob 47 et Dual Grid 16 | Tests de topologie et rendu |
| Préserver une falaise 32×48 | Échantillonnage vertical unique, départ à la ligne zéro, répétition verticale explicite | Tests de rendu cliff |
| Éviter les raccords visibles | Seam Doctor et quality gate sur albedo, normal, height et AO | Analyse multicanal et export bloqué si cassé |
| Ne pas perdre son travail | Bibliothèque IndexedDB, autosave et récupération | Tests du stockage durable |
| Continuer à travailler pendant un export | Worker, progression et annulation | QA navigateur et build worker |
| Construire des lieux reconnaissables | Macro Pattern Lab et Radar de répétition | Export de builders `TileMapPattern` |
| Composer plusieurs terrains | ID stables, familles, priorités et catalogue de compatibilité | UI Mes projets, CLI `catalog` |
| Éviter la configuration manuelle de Godot | Publication directe, addon activé et import `.tesserae` en `TileSet` | Import réel réussi dans Godot 4.7 pour Blob 47 et Dual Grid 16 |
| Ajouter le comportement du sol | Collision, navigation, occlusion, praticabilité, type de surface, pas et coût | Couches natives chargées et vérifiées par Godot 4.7 |
| Industrialiser les terrains | CLI validate/diff/smoke/build/catalog et CI dédiée | `pnpm check` et workflow GitHub |

## Choix « outside the box »

- **Le terrain comme contrat, pas comme image.** L’atlas, les raccords, la grille logique, la sémantique et les motifs ont des identités stables. Une modification peut donc être comparée et validée en CI.
- **La falaise dépasse la case sans agrandir la grille.** Sa hauteur visuelle reste indépendante de la cellule logique, ce qui évite les atlas à espacement variable.
- **Les coutures sont un diagnostic artistique.** Le Seam Doctor indique la cause probable et montre la différence pixel par pixel au lieu de retourner seulement « invalide ».
- **La variété se compose à l’échelle du lieu.** Les macro-motifs représentent un carrefour, une baie ou une entrée, tandis que les variantes conservent la variété locale.
- **Godot reçoit aussi l’intention de gameplay.** Le terrain sait s’il est praticable, quel son de pas jouer et quel coût de déplacement appliquer.

## Plan d’implémentation réalisé

1. Fiabilisation : stockage durable, récupération, exports observables et rendu progressif.
2. Contrat Godot : format versionné, ID stables, manifestes et publication directe.
3. Diagnostics : Seam Doctor, rapports qualité et Probe Godot.
4. Gameplay : sémantique compilée en couches et custom data Godot.
5. Level design : macro-motifs, radar de répétition et familles multi-terrain.
6. Production : CLI, diff déterministe, build headless, catalogue et CI.
7. Compréhension : écran « Prêt pour Godot » en langage simple, détails techniques repliés.

## Limites encore réelles

- La publication directe utilise l’API d’accès au système de fichiers de Chromium. Les autres navigateurs conservent l’export ZIP.
- Le catalogue multi-terrain décrit et valide les compatibilités ; il ne peint pas automatiquement les transitions artistiques entre deux matières différentes.
- Le SVG Composer reste un moteur visuel expérimental distinct de l’export d’atlas historique.

Le libellé « Prêt pour Godot » est maintenant soutenu par un smoke test complet : Tesserae fabrique un mini-projet, Godot 4.7 importe les deux topologies, puis un script charge les deux `TileSet`, vérifie les 47/16 états et les couches de gameplay. Ce test fait partie de la CI Tesserae.
