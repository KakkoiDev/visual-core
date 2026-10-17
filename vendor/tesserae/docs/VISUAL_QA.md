# Revue visuelle

Référence : `design/tesserae-concept.png`.

## Correspondances validées

- Même structure d’éditeur : top bar, matériaux à gauche, canvas central, inspecteur à droite, atlas en bas.
- Même hiérarchie sombre et dense, accents chauds pour les actions et le terrain, teal pour l’eau et les diagnostics.
- Les contrôles directionnels, la courbe, les miniatures de matériaux et les 47 vignettes restent lisibles simultanément à 1280 × 720.
- Le canvas garde la place dominante et la grille de couture reste visible sans masquer le terrain.

## Évolutions fonctionnelles visibles

- Le canvas du concept est devenu un sandbox directement peignable.
- La toolbar ajoute pinceau, gomme et taille 1–8.
- L’inspecteur directionnel expose rotation et miroirs pour N/E/S/W.
- Le dock ajoute Composition, diagnostics de coutures et export Godot détaillé.

## Écarts assumés

- Les matériaux par défaut sont procéduraux et non photoréalistes : ils servent de preuve technique avant l’import des assets de production d’un projet.
- L’éditeur cible une station de travail et impose une largeur minimale de 1000 px. À 1150 px, les panneaux et l’atlas se resserrent sans masquer les fonctions critiques.
- L’interface française couvre le workflow francophone initial ; l’anglais reste disponible pour les équipes internationales.

Validation navigateur : rendu 1280 × 720, peinture d’un îlot au centre du trou, changement d’onglet Composition, absence d’erreurs console, génération du pack revenue à l’état « Enregistré ».

## QA Art Lab — 10 juillet 2026

- Les vues Albedo, Normal, Height, AO et Light Stage sont alignées sur le masque sélectionné et restent lisibles à 1280 × 720.
- Le preset Moonlight modifie simultanément saturation, température, lumière, relief et occlusion ; le Light Stage réagit sans rechargement.
- Les cartes normal et AO utilisent des bordures neutres afin d’éviter les cassures d’éclairage aux raccords.
- Diagnostic après grading : 94 paires compatibles, écart RGB moyen 1,70/255, maximum 4,92/255, statut « Coutures saines ».
- L’export réel des 12 atlas (3 variantes × 4 canaux) termine sur « Enregistré », sans erreur ni avertissement console.
- L’écran Godot annonce et contient le manifest, l’importeur CanvasTexture, le shader 2D et la recette source.

## QA bibliothèque de configurations — 11 juillet 2026

- Premier lancement sur un stockage neuf : bibliothèque vide et trois entrées claires, projet vierge, preset et import.
- Le projet vierge contient exactement deux couches techniques éditables, Surface et Fond, une variante et aucun override.
- Renommage puis Enregistrer : passage de « Modifié » à « Enregistré » et mise à jour du nom dans la bibliothèque.
- Duplication : création immédiate d’une configuration « — copie » et passage de 1 à 2 projets.
- Suppression à double confirmation couverte par le test du modèle de bibliothèque.
- Rechargement complet : restauration automatique du projet actif dupliqué, sans réouverture forcée du hub.
- Migration de l’ancienne recette unique couverte par test ; aucune erreur ni alerte console pendant le parcours navigateur.

## QA Dual Grid 16 — 11 juillet 2026

- Basculement Blob 47 → Dual 16 sans rechargement et persistance du mode après sauvegarde puis rechargement.
- Atlas compact 4×4 : les 16 états, dont Vide, Plein, les quatre coins, les quatre creux et les deux diagonales, sont visibles simultanément à 1280 × 720.
- Le sandbox rend une grille visuelle décalée d’une demi-tuile depuis la même grille logique peignable.
- Les diagonales ambiguës peuvent être séparées ou reliées ; le changement recalcule atlas, sandbox et cartes auxiliaires.
- 128 raccords Dual Grid compatibles analysés : écart moyen 0,00/255, maximum 0,00/255, zéro bord PBR à risque.
- Export réel terminé sur « Enregistré » ; écran Godot vérifié avec atlas 4×4, importeur, helper `TesseraeDualGrid16.rebuild` et quatre cartes PBR 2D.
- 21 tests automatisés et build de production réussis, aucune erreur ni alerte console pendant le parcours navigateur.

## QA Tesserae EN/FR — 11 juillet 2026

- Renommage visible et technique vérifié : titre de page, marque, manifest, recettes, ZIP, scripts Godot, shader et helper Dual Grid utilisent Tesserae.
- L’anglais est sélectionné lorsqu’aucune préférence linguistique n’existe ; `document.documentElement.lang` vaut `en`.
- Bascule EN → FR immédiate sans rechargement : barre supérieure, matériaux, inspecteur, atlas, sandbox, Art Lab, diagnostics, aide et bibliothèque sont traduits.
- Persistance vérifiée dans les deux sens après rechargement complet (`fr`, puis `en`).
- La migration conserve les anciens projets et accepte encore les recettes `.tessera47.json`, tout en exportant désormais `.tesserae.json`.
- Recherche DOM ciblée : aucun libellé français résiduel dans l’interface anglaise testée.
- 24 tests automatisés et build de production réussis ; aucune erreur ni alerte console pendant les interactions linguistiques.

## QA du flux de production — 16 juillet 2026

- Nouveau flux explicite **Concevoir → Valider → Livrer à Godot** : la conception garde le canvas dominant, la validation regroupe les outils de preuve, et la livraison commence par un verdict compréhensible avant les détails moteur.
- La bibliothèque privilégie **Partir d’une texture** sans verrouiller la topologie, le mode de sortie ni les matières ; les modèles restent des accélérateurs secondaires.
- Les deux découpes alpha ont été vérifiées visuellement : damier à l’extérieur pour **Creuser à l’extérieur**, damier dans le motif pour **Creuser à l’intérieur**, extrusion numérique en pixels et restauration ciblée par Annuler.
- Le Blob 47 creusé à l’intérieur exporte 47 états de terrain plus une tuile utilitaire de remplissage ; le helper Godot reconstruit un overlay borné sans modifier l’espacement des cellules.
- Art Lab a été rééquilibré en bande de cinq canaux puis panneau de réglages lisible. Le panneau de livraison Godot ne déborde plus avec les libellés français.
- Parcours réels vérifiés à 1024×768, 1280×720, 1536×864 et 125 % d’échelle UI : aucun débordement de page, canvas et inspecteurs accessibles, actions compactes nommées.
- Navigation clavier validée pour les onglets de validation et Terrain/Matière ; les dialogues piègent le focus et le rendent au bouton d’ouverture.
- Validation automatisée : build de production, 20 fichiers de tests, 180 tests, contrat cut-out, contrôle des coutures et smoke CLI déterministe réussis.
