# Tesserae — audit produit centré sur le design des tuiles

## Verdict

Tesserae est déjà très fort pour **produire un atlas** et **prouver qu’il est techniquement sain**. Il était beaucoup moins fort pour le geste quotidien qui coûte vraiment du temps à un game designer : choisir une tuile problématique, comprendre son rôle, la retoucher sans casser ses voisines, puis décliner cette correction.

Le cap produit proposé est donc :

> Tesserae ne doit plus seulement générer 47 images. Il doit devenir un atelier de sculpture où chaque tuile connaît ses raccords, sa famille et les pixels que le designer peut modifier sans danger.

## Parcours audité

1. **Atlas 47 — bonne couverture, faible pouvoir d’action.** Les 47 états sont visibles et nommés, mais une sélection ne révélait ni anatomie, ni actions, ni explication des contacts.
2. **Tuile sélectionnée — état sans conséquence.** La tuile recevait un contour violet, sans passer d’une vue de contrôle à une vue d’auteur.
3. **Laboratoire — excellent test de formes.** Anneau, U, C, labyrinthe et îlots donnent un contexte utile, mais la boucle « voir le défaut → trouver la tuile → corriger → revoir le lieu » restait longue.
4. **Coutures — excellente preuve technique.** Le Seam Doctor sait mesurer la casse après coup. Il manquait une manière de prévenir la casse pendant la retouche.

## Forces à préserver

- Une seule recette nourrit l’atlas, le bac à sable, les diagnostics et Godot.
- Les 47 états Blob et 16 états Dual Grid sont complets et testables.
- Les falaises dépassent la cellule logique sans casser l’espacement du TileMap.
- Les variantes partagent une signature de bord.
- Les exports PBR et le TileSet Godot restent synchronisés.

## Fonctionnalités qui rendraient Tesserae indispensable

### 1. Le contrat de bord, visible et manipulable

Chaque tuile devrait exposer ses contacts comme une petite « anatomie » : haut, coins, côtés, famille de rotation et voisins compatibles. Le designer ne devrait jamais lire un masque binaire.

Évolution : afficher une empreinte colorée par bord, permettre de verrouiller un bord, et proposer immédiatement les tuiles qui partagent cette empreinte.

### 2. La chirurgie de tuile sans couture

Une texture importée en remplacement complet peut casser un atlas sain. Le mode **Centre protégé** conserve une couronne de pixels générés et n’autorise l’art personnalisé que dans la silhouette sûre. Le raccord devient une contrainte de création, pas un test final.

Évolution : un pinceau intégré avec trois calques logiques — raccord verrouillé, transition, intérieur libre — et un avertissement avant le premier pixel dangereux.

### 3. Les familles vivantes

Une tuile peinte devrait pouvoir engendrer ses rotations et miroirs. Les descendants doivent rester liés au parent : une retouche du parent se propage, sauf si le designer « détache » une orientation pour la rendre unique.

Le premier niveau, livré ici, crée déjà les rotations uniques d’un PNG.

### 4. La forge de variantes

Le designer peint une ou deux variantes intérieures ; Tesserae conserve les bords, mesure la distance visuelle entre variantes et propose un poids de distribution. Un indicateur distingue « variation invisible », « variété saine » et « rupture de style ».

### 5. Le test de contexte inversé

Au lieu de demander « cette tuile est-elle jolie ? », Tesserae doit demander « où cette tuile devient-elle visible ? ». Un clic sur un état devrait surligner toutes ses occurrences dans l’anneau, le labyrinthe et les motifs sauvegardés, avec un compteur de fréquence et les répétitions adjacentes.

### 6. Le métier à transitions

Deux terrains compatibles — sable et herbe, roche et terre — sont placés de part et d’autre d’une frontière témoin. Le designer peint seulement la grammaire de transition ; Tesserae compile les états mixtes nécessaires sans exploser en produit cartésien.

### 7. Le linter pixel-art

Pour les profils stricts : couleurs hors palette, alpha partiel involontaire, pixels isolés, filtrage non-nearest, doublons visuels, contrastes trop faibles à l’échelle de jeu et hauteurs de falaise non divisibles par la grille.

### 8. La cabine de lecture

Chaque tuile et chaque motif est prévisualisé à 1×, 2× et à la taille caméra réelle, sur les fonds, brouillards et lumières du jeu. Une bonne tuile d’éditeur peut être illisible dans la scène ; Tesserae doit révéler cet écart avant Godot.

### 9. Le round-trip d’artiste

Un dossier surveillé permet d’ouvrir une tuile dans Aseprite, Krita ou Photoshop. À l’enregistrement, Tesserae recharge l’image, rejoue les rotations liées et relance seulement les raccords touchés.

### 10. La mémoire visuelle du terrain

Chaque sauvegarde importante conserve une planche de référence. Le diff ne dit pas seulement « 124 pixels changés » : il montre quelles silhouettes, raccords, variantes et lieux réutilisables ont visuellement dérivé.

## Lot déployé

### Atelier tuile

- Nouvel onglet **Tuile** lié à la sélection de l’Atlas.
- Aperçu agrandi de l’état sélectionné.
- Nom humain, identifiant de masque et statut généré/personnalisé.
- Anatomie 3×3 des contacts actifs.
- Nombre d’orientations réellement uniques.
- Navigation précédent/suivant et ouverture directe par double-clic depuis l’Atlas.

### Centre protégé

- Chaque override manuel reçoit un mode et des réglages persistants.
- **Centre protégé** est le mode par défaut des nouveaux imports manuels.
- La bordure verrouillée est réglable en pixels.
- Une transition intérieure optionnelle adoucit la rencontre avec l’art généré.
- L’art personnalisé est clipsé par la silhouette générée : il ne peut pas inventer une connexion absente.
- L’aperçu affiche la limite de la zone éditable.
- **Remplacement libre** reste disponible pour les planches complètes déjà maîtrisées, notamment l’import Blob 15.

### Déclinaison des rotations

- Tesserae calcule la famille de rotation canonique en Blob 47 et Dual Grid 16.
- Un PNG importé peut générer toutes ses orientations uniques.
- Les réglages de protection sont recopiés avec chaque orientation.

## Plan d’implémentation

### Phase A — prévention des erreurs, livrée

1. Étendre la recette avec des réglages d’override par masque.
2. Ajouter le mélange « centre sûr » au renderer commun.
3. Utiliser ce renderer dans l’Atlas, les falaises projetées et les exports.
4. Ajouter l’anatomie et les familles de rotation.
5. Exposer import, protection, transition, rotation et suppression dans l’Atelier tuile.
6. Migrer les anciennes recettes en remplacement libre pour préserver leur rendu.

### Phase B — boucle d’auteur directe

1. Ajouter un éditeur pixel non destructif avec zoom, palette et onion skin des voisins.
2. Lier les rotations et miroirs au lieu de les copier définitivement.
3. Ajouter « voir cette tuile en contexte » depuis l’Atelier.
4. Faire relancer le Seam Doctor uniquement sur les bords affectés.

### Phase C — variété maîtrisée

1. Créer la Forge de variantes avec bords verrouillés.
2. Mesurer similarité, répétition et lisibilité à l’échelle caméra.
3. Autoriser des variantes par rôle : centre, bord droit, angle, cavité, extrémité.

### Phase D — écosystème d’artiste

1. Dossier surveillé et round-trip Aseprite/Krita/Photoshop.
2. Golden masters visuels par terrain et par contexte.
3. Métier à transitions multi-terrain.
4. Diff visuel de recette dans la CLI et la CI.

## Critère de réussite

Un designer doit pouvoir partir d’un défaut vu dans un niveau, identifier la tuile responsable, comprendre ses raccords, repeindre son centre, générer ses orientations et vérifier le résultat — sans lire un masque, sans casser les coutures et sans ouvrir l’inspecteur TileSet de Godot.
