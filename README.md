<div align="center">

# Relecture — Persona 1 FR 🜚

**Outil web de relecture de la traduction française de *Shin Megami Tensei: Persona* (PSP).**

On lit les scripts comme un roman, on clique sur une réplique pour en proposer
une autre — avec contrôle automatique des **trois** contraintes du jeu — puis on
envoie ses propositions groupées.

`100 % statique` · `HTML/CSS/JS` · `zéro build` · `zéro dépendance`

**→ [Ouvrir l'outil](https://codebyhaamza.github.io/p1-relecture/)**

</div>

> Projet de fans, gratuit et non commercial. *Shin Megami Tensei: Persona* © Atlus / SEGA.
> Traduction : **[CodeByHaamza/P1-FR-PSP](https://github.com/CodeByHaamza/P1-FR-PSP)**

---

## Relire, concrètement

1. Le [sommaire](https://codebyhaamza.github.io/p1-relecture/) montre les 284 scripts.
   Le filtre **Pas encore relus** mène directement au travail qui reste.
2. On lit le fil du script. **Chaque ligne à l'écran est une ligne du jeu** :
   le jeu ne renvoie jamais à la ligne tout seul, donc une coupure que vous voyez
   est une coupure qu'il fera. Une petite marque en fin de ligne dit laquelle
   (saut, nouvelle page, boîte qui se referme) ; la bascule **Codes** les écrit
   en clair si vous préférez.
   Le français tient la colonne ; l'anglais ne se montre qu'à la demande — lire
   deux colonnes en parallèle, c'est ne lire ni l'une ni l'autre.
3. Au clavier, sans quitter la position de lecture : <kbd>J</kbd>/<kbd>K</kbd>
   pour se déplacer, <kbd>[</kbd>/<kbd>]</kbd> de scène en scène,
   <kbd>N</kbd>/<kbd>P</kbd> de script en script, <kbd>E</kbd> pour proposer,
   <kbd>Échap</kbd> pour fermer, <kbd>A</kbd> et <kbd>C</kbd> pour les bascules.
   Le pied du fil mène au **prochain script que personne n'a pris** — on
   enchaîne sans repasser par le sommaire, 284 fois.
   Si vous revenez sur un script quitté en route, un bouton propose de
   **reprendre où vous en étiez**.
4. Une réplique à reprendre : **Proposer**. Trois jauges répondent pendant la
   frappe, et le bouton **Garder** reste gris tant qu'une contrainte n'est pas
   tenue. Rien ne part qui ne tienne dans le jeu.
5. En bas à droite, **Envoyer** ouvre une issue préremplie sur le dépôt de la
   traduction. Sans proposition, le même bouton dit **Signaler relu** : un script
   impeccable doit pouvoir ressortir relu sans qu'on invente une correction.

## Savoir ce qui est déjà lu

C'est la question qui décide si une relecture collective avance ou tourne en
rond. La réponse ne peut pas vivre dans le navigateur : elle doit être la même
pour tout le monde.

Elle vient donc des issues de **P1-FR-PSP**, celles que cet outil ouvre lui-même :

| sur la carte | ce que ça veut dire |
|---|---|
| **relu** (lune pleine) | une issue `Relecture : …` a été traitée et fermée |
| **en cours** (sceau d'or, avec le nom) | une issue est ouverte : quelqu'un s'en occupe, ne pas doubler |
| **lu par moi** | votre propre trace, dans **ce navigateur seulement** |
| *à lire* | personne n'y est encore passé |

`outils/etat_relecture.py` relit ces issues et en fait `data/etat.json`. Rien à
tenir à jour à la main, et l'état survit à un changement de machine.

## Les trois contraintes

Le site de Persona 2 n'en avait qu'**une** : un budget d'octets par ligne. P1 en
a **trois**, et la troisième n'est pas par ligne :

1. **les jetons** doivent être les mêmes que dans l'anglais, dans le même ordre —
   le jeu ne renvoie jamais à la ligne tout seul, donc un `{SAUT}` en moins est
   une ligne qui sort de la boîte. (`[0000]` est exclu de ce contrôle : ce n'est
   pas un code, c'est **l'espace**, et les menus en mettent onze devant `Office`
   pour le centrer alors que `Bureau` n'en a pas besoin.)
2. **la largeur**, mesurée en **pixels** : la police est à chasse variable, donc
   « 40 caractères » se trompe dans les deux sens. La limite de chaque zone est
   la ligne anglaise la plus large qu'on y trouve — ce n'est pas une estimation,
   c'est une borne observée : le jeu l'affiche sans la couper.
3. **le budget du bloc** : le coût d'une réplique est son écart à l'anglais
   multiplié par son nombre d'occurrences, et il est partagé par toutes les
   lignes du même bloc de 2 048 octets. Une réplique peut donc être juste à elle
   seule et faire quand même tomber **tout le fichier** en anglais dans le jeu,
   sans une erreur.

Les trois sont vérifiées **dans la page**, avant l'envoi.

## Les données, et comment elles se tiennent à jour

Rien n'est calculé dans le navigateur.

```
P1-FR-PSP/trad/        ──┐
data/metrique.json     ──┼─→  outils/generer.py  ──→  data/index.json
data/occurrences.json  ──┘                             data/scripts/*.json
                                                       data/contraintes.json
```

| fichier | contenu | d'où il vient |
|---|---|---|
| `data/index.json` | les 284 scripts : zone, répliques, qui y parle | regénéré |
| `data/scripts/*.json` | un script par fichier, répliques découpées en segments | regénéré |
| `data/contraintes.json` | avance de chaque glyphe, limite par zone, marge de chaque bloc | regénéré |
| `data/etat.json` | qui a relu quoi | relevé sur les issues |
| `data/metrique.json` | l'avance de chaque caractère, en pixels | **socle**, sorti du dépôt privé |
| `data/occurrences.json` | les répliques écrites dans plusieurs blocs | **socle**, sorti du dépôt privé |

Le socle ne dépend pas des traductions : la métrique vient de la police, les
occurrences viennent de l'anglais. Tout le reste se recalcule à partir de `trad/`,
qui est public — donc [un workflow](.github/workflows/synchroniser.yml) le refait
chaque jour, sans jeton ni secret, et ne publie que si les deux vérifications
passent.

La métrique des glyphes vient de la table du jeu, aux emplacements que le moteur
**p1es de Zenshou** utilise. Un accent n'ajoute rien à l'avance : il hérite de la
métrique de sa lettre de base — règle de Zenshou, appliquée par le build.

## Vérifier avant de publier

Trois contrôles, tous bloquants dans le workflow :

```bash
python verifier_donnees.py        # le contrat entre les données et la page
node outils/verifier_page.mjs     # js/mesure.js lui-même, sur les 24 000 répliques
node outils/verifier_rendu.mjs    # ce qu'on MONTRE est-il ce qu'on MESURE ?
```

Les deux derniers importent les fichiers que le navigateur exécutera, au lieu
d'en rejouer une transcription — une transcription peut être fidèle à un calcul
faux. `verifier_page` soumet tout le français **déjà en jeu** : si la page
refusait une seule de ces répliques, elle dirait faux, et un relecteur à qui
l'outil dit faux une fois ne lui fait plus confiance. `verifier_rendu` compare le
découpage en lignes de `rendu.js` à celui de `mesure.js`, parce qu'une page qui
montre trois lignes et en contrôle quatre laisse passer la quatrième sans un
mot.

## Les portraits

Rien n'est pris sur un site tiers :

- le casting vient de **[personadle](https://github.com/CodeByHaamza/personadle)**,
  déjà rassemblé ;
- le héros et les démons viennent **du jeu lui-même**, par `extraire_images.py`.

## Faire tourner en local

```bash
python outils/generer.py --trad ../P1-FR-PSP/trad   # si vous avez le clone à côté
python -m http.server 8731
# puis http://localhost:8731
```

Ouvrir `index.html` directement depuis le disque ne marche pas : les modules
JavaScript et `fetch` exigent un vrai serveur, fût-il local.

## Lisibilité : les choix, et pourquoi

On relit des heures, donc la lecture passe avant l'effet.

- **La mesure est bridée à 62 signes.** La colonne en faisait 110 : au-delà de
  75, l'œil perd sa ligne en revenant à la marge.
- **Une ligne du jeu = une ligne à l'écran.** Avant, les codes de coupure
  s'affichaient en pastille au milieu du texte et c'était la fenêtre qui coupait
  le reste — on ne pouvait pas distinguer une coupure du jeu d'une coupure du
  navigateur, ce qui est pourtant la seule chose à vérifier.
- **Contrastes mesurés, pas estimés.** Le gris des textes secondaires était à
  3,7:1 alors qu'il portait l'anglais en petit italique, et le rouge du
  dépassement — la couleur qui doit crier — était le plus faible de la palette.
  Tous deux sont remontés au-dessus de 4,5:1.
- **Les codes de substitution restent visibles** (`(*NOMBRE_HEROE*)`), parce que
  les masquer rendrait la phrase incompréhensible ; mais ils ne portent plus de
  bordure et sont à la taille du texte, pour ne pas le hacher.
- **Le bouton « Proposer » n'est jamais invisible.** Il l'était jusqu'au survol :
  sur un écran tactile il n'y a pas de survol, et au clavier un bouton invisible
  est un bouton qui n'existe pas.
- **Le nom du héros s'affiche au lieu de son code.** `(*APELLIDO_HEROE*)` occupe
  331 endroits ; en pastille monospace on n'entend plus la phrase, donc on ne
  juge ni son rythme ni son élision. Le nom apparaît souligné en pointillé —
  visiblement provisoire, puisque le joueur choisira le sien. La **mesure**, elle,
  porte toujours sur le code : la largeur réelle dépend de ce nom-là.
- **`{PAUSE}` est un point de suspension, pas une pastille** (381 occurrences) :
  c'est un temps d'arrêt, pas une coupure, et un mot au milieu de la phrase
  disait le contraire.
- **Trois crans de taille**, mémorisés. La mesure est en `ch`, donc le nombre de
  signes par ligne ne change pas — c'est lui qui compte, pas une largeur en pixels.
- **L'en-tête de scène reste collé en haut**, sous la barre dont la hauteur est
  mesurée pour de vrai : dans une scène de quarante répliques on ne savait plus
  laquelle on lisait.
- **Chaque locuteur a sa teinte**, sur l'anneau du portrait seulement. Jusqu'à 21
  voix par script : on reconnaît l'anneau avant d'avoir lu le nom.
- **Les polices sont servies d'ici.** Aucun appel réseau ne part d'une page de
  relecture : une page de relecture n'a pas à dire à un tiers qui relit quoi et
  quand, et un chargement distant fait danser le texte au premier affichage.

## Une mesure à confirmer en jeu

La limite de chaque zone est la ligne anglaise la plus large qu'on y trouve :
l'anglais d'origine tient forcément, donc c'est une borne observée et non une
estimation. Sauf que les **négociations** ne rangent pas une réplique par
entrée : la réaction du démon change selon ce que le joueur vient de dire, et
plusieurs réponses tiennent dans la même entrée, séparées par un marqueur
encadré `[FFFD]…[F5xx]`.

Tant qu'on ne coupait pas là, deux répliques étaient mesurées comme une seule
ligne — `YOU LOVE ME?   AWOOO! YOU SEDUCE ME!` — et la limite calculée valait
**568 px pour une boîte qui n'en fait que 426**. La jauge laissait donc passer un
tiers de trop sur la moitié du corpus. C'est corrigé, et trois lignes françaises
trop larges sont apparues du même coup.

Reste que 426 px est une borne *déduite*, pas une largeur *vue*. Si quelqu'un
joue une négociation et constate qu'une ligne est coupée, c'est l'information
qui manque — dites-le dans une issue.

## À faire

- un portrait pour les personnages qui n'en ont pas encore (ils tombent sur
  l'initiale, ce qui marche mais ne raconte rien).
