# Audit complet de la documentation TileSetter

Audit effectué le 10 juillet 2026 sur toutes les pages uniques reliées par l’index : [Index](https://www.tilesetter.org/docs/index), [Tiles and Sources](https://www.tilesetter.org/docs/tiles_and_sources), [Working with Tiles](https://www.tilesetter.org/docs/working_with_tiles), [Generating Tilesets](https://www.tilesetter.org/docs/generating_tilesets), [Tileset Behavior](https://www.tilesetter.org/docs/tileset_behavior), [Map Editing](https://www.tilesetter.org/docs/map_editing), [Exporting](https://www.tilesetter.org/docs/exporting) et [Changelog](https://www.tilesetter.org/docs/changelog).

## Idées retenues et implémentées

| Idée TileSetter | Adaptation Tesserae |
|---|---|
| Séparer les sources image des tuiles | Chaque couche est une source non destructive partagée par les 47 états. L’onglet Composition montre toutes les dépendances. |
| Bords différents selon N/E/S/W, rotation et miroirs | Activation, rotation 0/90/180/270, miroir X et miroir Y indépendants pour chaque côté. |
| Cutoff sous les bords | Paramètre signé par couche afin de supprimer les bavures ou, avec une valeur négative, laisser davantage de matière. |
| Merge points | Point de fusion global qui limite le chevauchement dans les passages étroits. |
| Blob relations | Énumération canonique des 47 masques et suppression automatique des diagonales invalides. |
| Proxy tiles et probabilités | Jusqu’à quatre variantes avec poids indépendants, conservés dans le manifest exporté. |
| Remplacement des tuiles générées | Override PNG/WebP individuel, réversible et signalé dans l’atlas. |
| Composition/source breakdown | Inspecteur de composition pour la tuile sélectionnée. |
| Sandbox d’auto-tiling | Peinture et effacement directs, brosse 1–8, presets de stress, grille et vue masque/composite. `Ctrl + molette` change la brosse. |
| Export des relations | Manifest JSON complet et importeur Godot 4.x préconfiguré avec les huit peering bits. |
| Diagnostics | Analyse automatique de toutes les paires de coutures compatibles avec classement et pires écarts. |
| UI scaling et tooltips | Échelles 85/100/115 %, titres d’outils, raccourcis d’annulation et sauvegarde. |
| Projet rééditable | Sauvegarde locale, historique undo/redo et import/export de recette versionnée. |

## Idées adaptées plutôt que copiées

- Les *Sync Regions* dépendent d’un accès permanent au système de fichiers, non portable dans un navigateur. Tessera garde donc les sources dans une recette locale et permet leur remplacement explicite.
- Les relations *Prop* servent surtout aux objets multi-tuiles. Tessera se concentre sur le terrain blob-47 et utilise le sandbox pour les compositions multi-cellules.
- Wang 16 reste un autre modèle topologique. Le cœur actuel de Tesserae est Blob 47 ; le moteur garde un manifeste ouvert afin qu’un exporteur Wang puisse être ajouté sans diluer l’éditeur actuel.
- Les mixed borders combinatoires entre de nombreux terrains provoqueraient une explosion d’atlas. La pile de couches directionnelles et les recettes de transition offrent un contrôle plus prévisible pour les pipelines Blob 47.

## Avantages propres à Tesserae

- Aspérités périodiques sans couture pilotées par graine.
- Gradients alpha continus entre un nombre arbitraire de matières.
- Textures importées et motifs procéduraux utilisables ensemble.
- Contrôle directionnel par couche, pas seulement par atlas.
- Validation des coutures avant export.
- Export Godot autonome sans service externe.
