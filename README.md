<div align="center">

# Relecture — Persona 1 FR 🜚

**Outil web de relecture de la traduction française de *Shin Megami Tensei: Persona* (PSP).**

On lit les scripts comme un roman, on clique sur une réplique pour en proposer
une autre — avec contrôle automatique des **trois** contraintes du jeu — puis on
envoie ses propositions groupées.

`100 % statique` · `HTML/CSS/JS` · `zéro build` · `zéro dépendance`

</div>

> Projet de fans, gratuit et non commercial. *Shin Megami Tensei: Persona* © Atlus / SEGA.
> Traduction : **[CodeByHaamza/P1-FR-PSP](https://github.com/CodeByHaamza/P1-FR-PSP)**

---

## L'apparence

Direction **« Grimoire violet »**. Persona 1 n'est pas le bleu froid de Persona 2 :
c'est l'occulte, les arcanes, le rituel de convocation. D'où l'aubergine profond,
le violet, l'or des cartes — et le texte en parchemin, jamais en blanc pur.

Une contrainte prime sur l'esthétique : **on relit des heures**. Le corps est en
*Spectral*, dessiné pour la lecture à l'écran ; le fond reste sombre sans jamais
être noir ; et chaque script porte sa **phase de lune**, le seul cadran qui ait
du sens dans un jeu qui compte ses jours ainsi.

## Ce qui le distingue du site de Persona 2

P2 n'avait qu'**une** contrainte : un budget d'octets par ligne. P1 en a **trois**,
et la troisième n'est pas par ligne :

1. le nombre de `{SAUT}` doit être **identique à l'anglais** — le jeu ne renvoie
   jamais à la ligne tout seul ;
2. la ligne doit tenir dans la boîte, et c'est une **mesure en pixels** : la
   police est à chasse variable, donc « 40 caractères » se trompe dans les deux
   sens ;
3. **le budget du bloc** : le coût d'une réplique est son écart à l'anglais
   multiplié par son nombre d'occurrences, et il est partagé par toutes les
   lignes du même bloc. Une réplique peut donc être juste à elle seule et faire
   quand même tomber tout le fichier en anglais dans le jeu.

Les trois sont vérifiées **dans la page**, avant l'envoi.

## Les données

Rien n'est calculé dans le navigateur. `generer_relecture.py`, côté dépôt privé,
produit :

| fichier | contenu |
|---|---|
| `data/index.json` | les 284 scripts : zone, nombre de répliques, qui y parle |
| `data/scripts/*.json` | un fichier par script, répliques déjà découpées en segments |
| `data/contraintes.json` | la largeur de chaque glyphe, la limite par zone, et pour chaque réplique son bloc, ses occurrences et la marge qui reste |

La métrique des glyphes vient de la table du jeu, aux emplacements que le moteur
**p1es de Zenshou** utilise. Un accent n'ajoute rien à l'avance : il hérite de la
métrique de sa lettre de base — règle de Zenshou, appliquée par le build.

## Les portraits

Rien n'est pris sur un site tiers :

- le casting vient de **[personadle](https://github.com/CodeByHaamza/personadle)**,
  déjà rassemblé ;
- le héros et les démons viennent **du jeu lui-même**, par `extraire_images.py`.

## Faire tourner

```bash
python -m http.server 8731
# puis http://localhost:8731
```

Ouvrir `index.html` directement depuis le disque ne marche pas : les modules
JavaScript et `fetch` exigent un vrai serveur, fût-il local.

## État

- ✅ **Sommaire** — la grille des arcanes, filtres par zone, recherche par script
  ou par personnage, et la lune qui dit ce qu'on a déjà lu.
- ⏳ **Lecture** — le fil des répliques, portraits, comparaison FR/EN.
- ⏳ **Éditeur** — jetons en pastilles insécables, jauge des trois contraintes.
- ⏳ **Panier** — regrouper ses propositions et les envoyer d'un coup.

### À faire avant publication

- héberger les polices au lieu de les charger depuis Google Fonts, comme le fait
  le site de P2 — aucun appel réseau ne devrait partir d'une page de relecture ;
- l'état « déjà relu » est pour l'instant **local au navigateur**. L'état partagé
  viendra des propositions ouvertes et fusionnées, que le suivi du dépôt calcule
  déjà.
