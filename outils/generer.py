#!/usr/bin/env python3
"""Fabrique les donnees du site a partir du depot PUBLIC de la traduction.

    python outils/generer.py --trad ../P1-FR-PSP/trad

Pourquoi ici et pas dans le depot prive
---------------------------------------

Le site doit se remettre a jour tout seul quand une relecture est fusionnee.
S'il fallait l'EBOOT du jeu pour cela, personne ne pourrait le faire tourner et
le site serait perime une semaine apres sa mise en ligne.

Or tout ce qui depend du jeu ne depend PAS des traductions :

  `data/metrique.json`     l'avance de chaque caractere en pixels, la limite
                           de chaque zone. Donnees du moteur ; elles bougent
                           si la police change, c'est-a-dire jamais.

  `data/occurrences.json`  les repliques ecrites dans plusieurs blocs a la
                           fois. Depend de l'anglais, donc fige.

Ces deux fichiers sont versionnes ici, sortis du depot prive par
`exporter_relecture_socle.py`. Tout le reste — les scripts, les marges de bloc
— se recalcule a partir de `trad/`, qui est public. Ce script n'a donc besoin
que d'un `git clone` et de Python.

Ce qu'il produit
----------------

`index.json`       la liste des scripts : zone, repliques, qui y parle. De quoi
                   batir le sommaire sans ouvrir trois cents fichiers.

`scripts/*.json`   un fichier par script, repliques **deja decoupees** en
                   segments. Le navigateur ne connait pas la grammaire des
                   jetons du jeu et n'a pas a l'apprendre.

`contraintes.json` de quoi verifier une proposition DANS LA PAGE avant de
                   l'envoyer : largeur des glyphes, limite par zone, et pour
                   chaque bloc la marge d'octets qui lui reste.

Cette derniere ligne est le coeur. Une replique peut etre juste a elle seule et
faire deborder son bloc, parce que son cout est multiplie par ses occurrences
et partage avec toutes les lignes du meme bloc — et un bloc qui deborde fait
retomber tout son fichier en anglais, sans erreur. Sans cette donnee la jauge
mentirait, et une jauge qui ment decourage plus qu'elle n'aide.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent

JETON = re.compile(r"(\{[A-Z]+\}|\(\*[^*]*\*\)|\[[0-9A-Fa-f]{4}\])")
CJK = re.compile(r"[぀-ヿ一-鿿]")
REMPLISSAGE = re.compile(r"\s{6,}")

# Ce que chaque jeton fait a l'ecran. Tout ce qui termine une ligne affichee :
# le saut manuel, le changement de page, la fermeture de la boite, l'attente
# d'une touche, le cadre du locuteur, et `(*RESPONSE*)` — une entree de
# negociation en contient plusieurs et chacune s'affiche a son tour.
# Le marqueur de replique suivante n'est pas UN jeton mais une suite de
# plusieurs (voir SEPARATEUR plus bas) : on le remplace par un jeton de notre
# cru avant de decouper, pour que la page le voie comme une fin de ligne
# ordinaire. Le texte brut, lui, n'est jamais touche — c'est celui-la qu'on
# renvoie au depot.
REPLIQUE = "{REPLIQUE}"

COUPE = {"{SAUT}", "{PAGE}", "{FERME}", "{ATTENTE}", "(*SPEAKER*)", "(*RESPONSE*)", REPLIQUE}
# `{PAUSE}` marque un temps, pas une fin de ligne : le texte continue apres.
PAUSE = {"{PAUSE}"}
# Le moteur remplace ces signes avant d'encoder : les mesurer autrement serait
# mesurer un texte que le jeu n'affiche pas.
ANCHOS = {"…": "...", "’": "'", "‘": "'", "“": '"', "”": '"', "—": "-", "–": "-"}
# `[0000]` n'est pas un code de controle : c'est L'ESPACE. Il ne figure pas
# dans la table de caracteres, il s'encode sur le code 0, et l'extracteur de
# l'EBOOT l'ecrit sous cette forme — d'ou `Teacher's[0000]Lounge`. Il vaut donc
# 5 px, il se lit comme une espace, et son nombre change legitimement d'une
# langue a l'autre : les menus sont centres au remplissage, et « Bureau » n'a
# pas besoin des onze espaces de « Office ».
ESPACE_BRUT = re.compile(r"\[0000\]")

# Une entree de negociation contient PLUSIEURS repliques du demon : sa reaction
# change selon ce que le joueur vient de dire. Elles sont separees par un
# marqueur encadre — `[FFFD]` un code `[F5xx]` — dont le milieu s'ecrit
# `[72FF]`, ou sous la forme du caractere que la table donne a ce code : « E »
# accentue pour 0x00FF, « alpha » pour 0x01FF. Comme il n'est reconnu qu'entre
# ses crochets, « IMPERATRICE » reste un mot.
#
# Il ne figure que dans les negociations, 3 118 fois. Ne pas couper la, c'est
# afficher `YOU LOVE ME?   AWOOO! YOU SEDUCE ME!` — une question et un
# rugissement sur la meme ligne — et les mesurer ensemble.
SEPARATEUR = re.compile(
    r"\[FFFD\](?:\[[0-9A-Fa-f]{4}\]|[^\[])*?\[F5[0-9A-Fa-f]{2}\](?:\[[0-9A-Fa-f]{4}\])*"
)
# Deux entrees collent leurs repliques sans marqueur : ponctuation de fin, deux
# espaces LITTERALES, une capitale. Nulle part ailleurs dans le corpus. Ne pas
# confondre avec le trou d'un jeton retire (« teacher for  and the »), qui n'a
# qu'une espace de chaque cote dans le texte brut.
COLLAGE = re.compile(r"(?<=[.!?])  +(?=[A-ZÀ-Ý])")

ZONES = ("dialogues", "negociations", "eboot", "donjons", "noms")

# Les portraits qu'on a sous la main, par nom francais du locuteur.
PORTRAITS = {
    "Nanjo": "Nanjo",
    "Mark": "Mark",
    "Elly": "Elly",
    "Ayase": "Ayase",
    "Brown": "Brown",
    "Maki": "Maki",
    "Yukino": "Yukino",
    "Reiji": "Reiji",
    "Igor": "Igor",
    "Philémon": "Philemon",
    "Naoya": "Naoya",
}


def nu(texte: str) -> str:
    """Le texte tel que le moteur l'encode : sans jetons, et sans les signes
    qu'il remplace avant d'ecrire. « … » devient trois points, soit trois
    glyphes au lieu d'un — compter autrement, c'est annoncer une marge qu'un
    bloc n'a pas. Meme fonction que `budget_blocs.py`, a ceci pres qu'on y
    rend son espace a `[0000]` ; la zone des dialogues, seule a porter des
    marges de bloc, n'en contient aucun, donc les deux donnent le meme chiffre.
    """
    texte = SEPARATEUR.sub("", texte or "")
    texte = ESPACE_BRUT.sub(" ", texte)
    texte = JETON.sub("", texte)
    for a, b in ANCHOS.items():
        texte = texte.replace(a, b)
    return texte


def regles_des_noms(chemin: Path) -> list[str]:
    """Les regles de nommage, LUES dans `docs/REGLES.md` du depot public.

    Pas recopiees : lues. Deux copies d'une regle, et c'est la perimee qu'on
    lit — on vient de le payer. Le 07/10/2026, 102 propositions de relecture
    sur 381 violaient « Majuscule au premier mot seulement », une regle qui
    existait, qui etait publiee, et qu'un relecteur travaillant dans l'outil ne
    croisait jamais. Elle s'affiche donc maintenant la ou il ecrit.

    On ne prend que les puces de la section, et on garde leur gras : c'est la
    partie qu'on lit en diagonale quand on cherche vite.
    """
    if not chemin.exists():
        return []
    dedans, out = False, []
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        if ligne.startswith("## "):
            if dedans:
                break
            dedans = "noms d'objets" in ligne.lower()
            continue
        if dedans and ligne.startswith("- "):
            out.append(ligne[2:].strip())
        elif dedans and out and ligne.startswith("  ") and ligne.strip():
            # Une puce qui continue sur la ligne suivante.
            out[-1] += " " + ligne.strip()
    return out


def bloc_de(identifiant: str) -> str:
    """`E0.BIN:000:0054` -> `E0.BIN:000`, le bloc de 2048 octets qui la porte."""
    return ":".join(identifiant.split(":")[:2])


def segmenter(brut: str) -> list[dict]:
    """Une replique decoupee comme le jeu l'affiche.

    `{t}` du texte, `{nl}` un passage a la ligne, `{p}` une pause, `{j}` un
    jeton quelconque — que la page montre en pastille et interdit de modifier.
    """
    out = []
    brut = SEPARATEUR.sub(REPLIQUE, brut or "")
    brut = COLLAGE.sub(REPLIQUE, brut)
    # `re.split` avec UN groupe capturant rend [texte, code, texte, code, ...] :
    # c'est la POSITION qui dit ce qu'on tient, pas la premiere lettre. Juger
    # sur `startswith("(")` faisait passer pour un code tout texte entre
    # parentheses — « (Tch... guess he won't go down that », « (Toggles Persona
    # summoning and », « (What should I do...?) ». Or dans Persona 1 la
    # parenthese porte les pensees du heros et les choix de negociation : ces
    # repliques s'affichaient en pastille monospace, et on ne pouvait pas les
    # corriger.
    for i, morceau in enumerate(JETON.split(brut or "")):
        if not morceau:
            continue
        if i % 2 == 0:
            out.append({"t": morceau})
        elif morceau == "[0000]":
            # Une espace, pas un code : la page la rend comme telle, avec un
            # point tres pale pour qu'on voie qu'elle est ecrite en octets.
            out.append({"e": morceau})
        elif morceau in COUPE:
            out.append({"nl": morceau})
        elif morceau in PAUSE:
            out.append({"p": morceau})
        else:
            out.append({"j": morceau})
    return out


def lignes_affichees(texte: str) -> list[str]:
    """Le texte decoupe comme le jeu l'affiche, une ligne par entree, ROGNEE.

    Un libelle de menu est centre par des espaces de tete : les compter dans sa
    largeur ferait monter l'etalon a 1 880 px, soit une limite qui n'interdit
    plus rien. Ce que le relecteur ecrit, c'est le texte. Les espaces
    INTERIEURES comptent, elles — « Salle des profs » est plus large que
    « Salledesprofs », et c'est tout l'interet de rendre son espace a `[0000]`.
    """
    texte = SEPARATEUR.sub(REPLIQUE, texte or "")
    texte = COLLAGE.sub(REPLIQUE, texte)
    texte = ESPACE_BRUT.sub(" ", texte)
    for a, b in ANCHOS.items():
        texte = texte.replace(a, b)
    coupe = "|".join(re.escape(c) for c in sorted(COUPE))
    return [JETON.sub("", m).strip() for m in re.split(coupe, texte)]


def est_affichee(ligne: str) -> bool:
    """Cette ligne est-elle rendue dans une boite ?

    Un remplissage d'espaces appartient a un bloc de mise en scene, le japonais
    inutilise n'est jamais atteint, et au-dela d'une soixantaine de signes ce
    n'est pas une ligne mais une entree dont on ne modelise pas la decoupe
    interne. Meme regle que `largeur_pixels.py` cote traduction : les deux
    doivent ecarter exactement les memes lignes, sinon la page criera sur du
    travail valide.
    """
    if CJK.search(ligne):
        return False
    net = ligne.strip()
    # Le remplissage ne se juge que sur l'INTERIEUR : les lignes arrivent deja
    # rognees, et un libelle de menu centre par des espaces de tete est bien
    # affiche par le jeu. La regle brute en ecartait cent quatre-vingt-huit.
    if REMPLISSAGE.search(net):
        return False
    return 0 < len(net) <= 60 and any(c.isalpha() for c in net)


def entrees(fichier: Path):
    brut = json.loads(fichier.read_text(encoding="utf-8"))
    if isinstance(brut, list):
        for e in brut:
            if isinstance(e, dict):
                yield e


def fichiers(dossier: Path):
    for chemin in sorted(dossier.glob("*.json")):
        if not chemin.name.startswith("_"):
            yield chemin


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--trad",
        type=Path,
        default=RACINE.parent / "P1-FR-PSP" / "trad",
        help="le dossier trad/ d'un clone de P1-FR-PSP",
    )
    ap.add_argument("--sortie", type=Path, default=RACINE / "data")
    ap.add_argument(
        "--regles",
        type=Path,
        default=None,
        help="docs/REGLES.md du depot public ; defaut : a cote de --trad",
    )
    args = ap.parse_args(argv)

    if not args.trad.is_dir():
        print(f"  {args.trad} introuvable : clonez P1-FR-PSP a cote", file=sys.stderr)
        return 2

    socle = args.sortie
    try:
        metrique = json.loads((socle / "metrique.json").read_text(encoding="utf-8"))
        repetees = json.loads((socle / "occurrences.json").read_text(encoding="utf-8"))["repetees"]
    except FileNotFoundError as e:
        print(f"  socle manquant : {e.filename}", file=sys.stderr)
        print("  il est versionne ; relancez exporter_relecture_socle.py cote prive", file=sys.stderr)
        return 2

    regles = regles_des_noms(args.regles or args.trad.parent / "docs" / "REGLES.md")

    (args.sortie / "scripts").mkdir(parents=True, exist_ok=True)

    index = []
    cout_par_bloc = collections.Counter()
    blocs_connus = set()

    for zone in ZONES:
        dossier = args.trad / zone
        if not dossier.is_dir():
            continue

        for chemin in fichiers(dossier):
            repliques, locuteurs = [], set()
            for e in entrees(chemin):
                if not e.get("en"):
                    continue
                oid = e["id"]
                blocs = repetees.get(oid) or [bloc_de(oid)]
                loc = e.get("locuteur_fr") or ""
                if loc:
                    locuteurs.add(loc)
                en, fr = e.get("en", ""), e.get("fr", "")
                repliques.append(
                    {
                        "id": oid,
                        "bloc": blocs[0],
                        "occ": len(blocs),
                        "loc": loc,
                        "loc_en": e.get("locuteur") or "",
                        "portrait": PORTRAITS.get(loc, ""),
                        "en": segmenter(en),
                        "fr": segmenter(fr),
                        "brut_en": en,
                        "brut_fr": fr,
                        # Le slot : l'EBOOT et les noms vivent a un emplacement
                        # de taille FIXE, et un caractere de trop est tronque en
                        # jeu sans erreur. 3 394 entrees sur 24 584 en ont un —
                        # et ce sont justement celles qu'on a donnees a relire
                        # en premier. La jauge l'ignorait : 173 propositions de
                        # bonne foi debordaient leur slot en croyant tenir.
                        "max": e.get("max") or 0,
                        "japonais": bool(CJK.search(en)),
                        # Un bloc de mise en scene n'est pas du dialogue : le
                        # jeu ne l'affiche pas, et le donner a relire ferait
                        # crier les jauges sur du travail valide.
                        "technique": not any(est_affichee(x) for x in lignes_affichees(en)),
                    }
                )

                # Le cout en octets, meme arithmetique que `budget_blocs.py` :
                # l'ecart au nombre de caracteres anglais, multiplie par les
                # occurrences et par deux octets. Le nom du locuteur est encode
                # avec chaque replique, il compte donc aussi.
                if zone == "dialogues":
                    blocs_connus.update(blocs)
                    if fr:
                        d = len(nu(fr)) - len(nu(en))
                        if loc:
                            d += len(loc) - len(e.get("locuteur") or "")
                        for bloc in blocs:
                            cout_par_bloc[bloc] += 2 * d

            nom = chemin.stem
            (args.sortie / "scripts" / f"{zone}__{nom}.json").write_text(
                json.dumps(
                    {"zone": zone, "nom": nom, "repliques": repliques}, ensure_ascii=False
                ),
                encoding="utf-8",
            )
            index.append(
                {
                    "zone": zone,
                    "nom": nom,
                    "repliques": len(repliques),
                    "lisibles": sum(
                        1 for r in repliques if not r["japonais"] and not r["technique"]
                    ),
                    "traduites": sum(1 for r in repliques if r["brut_fr"]),
                    "locuteurs": sorted(locuteurs),
                }
            )

    # Positif = il reste de la place. Un bloc sans traduction garde sa marge
    # pleine, mais on ne connait pas sa taille : on dit seulement zero de
    # surplus, ce qui est vrai.
    marges = {bloc: -cout_par_bloc.get(bloc, 0) for bloc in sorted(blocs_connus)}

    (args.sortie / "index.json").write_text(
        json.dumps(
            sorted(index, key=lambda x: (x["zone"], x["nom"])), ensure_ascii=False, indent=1
        ),
        encoding="utf-8",
    )
    (args.sortie / "contraintes.json").write_text(
        json.dumps(
            {
                "_source": "outils/generer.py, depuis trad/ de P1-FR-PSP et le socle versionne",
                "_regle": "avance = largeur + 1 (moteur p1es de Zenshou) ; espace = 5 px",
                "avances_car": metrique["avances_car"],
                "espace_px": metrique["espace_px"],
                "limites_px": metrique["limites_px"],
                "marges_bloc": marges,
                # Les regles de nommage, pour que la page les montre a qui
                # ecrit un nom. Lues dans le depot public, jamais recopiees.
                "regles_noms": regles,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print(f"  {len(index)} scripts -> {args.sortie}")
    for zone in ZONES:
        n = sum(1 for i in index if i["zone"] == zone)
        if n:
            print(f"    {zone:14} {n:>4} scripts, limite {metrique['limites_px'].get(zone, 0)} px")
    print(f"  {len(regles)} regle(s) de nommage reprise(s) de docs/REGLES.md")
    serres = sum(1 for m in marges.values() if m < 64)
    print(f"  {len(marges)} blocs ; {serres} a moins de 64 octets de marge")
    if any(m < 0 for m in marges.values()):
        trop = sorted((m, b) for b, m in marges.items() if m < 0)
        print(f"  ATTENTION {len(trop)} bloc(s) deja en depassement : {trop[:3]}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
