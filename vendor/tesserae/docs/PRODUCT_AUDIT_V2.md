# Tesserae — audit produit, seconde passe

## Périmètre

Audit combiné UX, level design et accessibilité du parcours : bibliothèque → édition → laboratoire → diagnostic → remise à Godot. Les preuves ont été capturées le 14 juillet 2026 sur l’application locale, en français, à 1280×720.

## Verdict

Tesserae a franchi le cap du générateur d’atlas : il sait produire, vérifier et installer un terrain natif. Son prochain cap est de comprendre **le contrat du jeu** et de livrer **une preuve jouable**, pas seulement des fichiers sains.

## Parcours audité

1. **Poste de travail — sain mais très dense.** L’aperçu, les matériaux et les paramètres restent visibles ensemble, ce qui est puissant. En revanche, aucune règle de production n’indique si les arrondis, déformations ou répétitions sont autorisés dans le jeu cible.
2. **Bibliothèque — utile mais sans notion de projet de jeu.** Les terrains sont sauvegardés et comparables, mais ils ne partagent pas encore un profil de direction artistique. L’état non enregistré désactive presque toute la bibliothèque et rend l’écran visuellement très sombre.
3. **Laboratoire — bons scénarios, preuve implicite.** Anneau, U, C, labyrinthe et îlots sont de bons stress tests. Le designer doit toutefois deviner ce que chaque scénario prouve et interpréter lui-même le résultat.
4. **Coutures — diagnostic robuste, langage d’ingénieur.** Les quatre canaux et le Docteur des coutures sont excellents. Quand tout va bien, les identifiants `m16 v1` et la longue liste de paires ajoutent du bruit sans aider une décision de level design.
5. **Godot — remise claire, dernière étape manquante.** « Prêt pour Godot » répond correctement à la question de confiance. Il manque encore l’action décisive : ouvrir une petite scène déjà peinte pour tester immédiatement la grille, les collisions et les falaises.

## Risques d’accessibilité observables

- Plusieurs textes secondaires sont très petits et faiblement contrastés, particulièrement dans la bibliothèque et le dock inférieur.
- Certains boutons d’icône ont une zone d’action visuellement étroite.
- La structure sémantique et les libellés accessibles sont globalement solides dans le DOM capturé.
- Les captures ne suffisent pas à prouver le parcours clavier complet, le contraste WCAG exact ni le comportement avec lecteur d’écran.

## Opportunités prioritaires

### P0 — Contrat de production

Un profil attaché à la recette exprime les règles du jeu : libre, pixel strict ou orthogonal 90°. Tesserae applique les garde-fous et bloque les dérives involontaires avant export. Le profil orthogonal impose notamment des angles carrés, des bords droits, un fond transparent et une falaise verticale préservée une fois.

### P0 — Terrain d’essai Godot

Chaque publication directe livre une scène `tesserae-playground.tscn`. Elle charge le TileSet importé et peint automatiquement un anneau Blob 47 ou les seize états Dual Grid. Le designer peut l’ouvrir ou la lancer immédiatement dans Godot.

### P1 — Preuve de level design

Un rapport orienté usage remplace la lecture des masques : coins et cavités, chemins étroits, îlots, falaises, répétition et comportement Godot. Les détails techniques restent disponibles pour diagnostiquer.

### P2 — Atelier de transitions

Choisir deux terrains d’une même famille, peindre une frontière témoin et générer les transitions mixtes sans explosion combinatoire.

### P2 — Golden Masters en contexte

Conserver des captures de référence et comparer avant/après dans des contextes de caméra, fond, lumière et brouillard proches du jeu.

## Plan d’implémentation

1. Ajouter les profils de production au format de recette et à la normalisation.
2. Compiler leurs règles dans le quality gate et les exposer dans l’inspecteur.
3. Ajouter une preuve de level design lisible dans le dock inférieur.
4. Générer un terrain d’essai avec la publication Godot et le build headless.
5. Étendre les tests TypeScript et le smoke test Godot aux nouveaux contrats.
6. Rejouer le parcours navigateur et vérifier les états français/anglais.

## Critère de réussite

Un designer doit pouvoir répondre sans lire un masque ni ouvrir l’inspecteur TileSet de Godot : **« ce terrain respecte les règles visuelles de mon jeu, ses cas difficiles sont vérifiés et je peux le tester tout de suite dans une scène Godot »**.

## État de déploiement

- Contrat de production : déployé avec trois profils, garde-fous d’export et migration des anciennes recettes.
- Preuve de level design : déployée dans l’onglet **Test jeu** avec six vérifications lisibles et des raccourcis vers les outils de diagnostic.
- Terrain d’essai Godot : déployé pour Blob 47 et Dual Grid 16 ; les deux scènes sont instanciées et peintes dans le smoke test Godot 4.7.
- Atelier de transitions et Golden Masters en contexte : conservés comme prochaines extensions, car ils nécessitent un modèle de données et un parcours d’auteur dédiés plutôt qu’un ajout superficiel.
