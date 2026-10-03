#!/usr/bin/env python3
"""Rapatrie les polices depuis Google Fonts, une fois, et ecrit `css/polices.css`.

    python outils/polices.py

Pourquoi les heberger
---------------------

Une page de relecture n'a pas a dire a un tiers qui relit quoi et quand : le
seul appel reseau qui partait d'ici etait celui-la, il part plus. Et un
chargement distant fait danser le texte au premier affichage, ce qui compte
quand on s'installe pour des heures.

Ce qu'on embarque
-----------------

Les sous-ensembles « latin » et « latin-ext » seulement : le corpus est
francais. Google Fonts en decoupe trente-sept, dont le cyrillique et le grec —
inutiles ici. Les quelques marqueurs grecs du corpus (alpha, beta, gamma)
retombent sur une police systeme ; ce ne sont pas des textes a lire.

Les trois familles sont sous SIL Open Font License 1.1, qui autorise cet
hebergement. La licence est recopiee dans `polices/LICENCES.md`.

A relancer seulement si l'on change de police.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

REQUETE = (
    "https://fonts.googleapis.com/css2"
    "?family=Marcellus+SC"
    "&family=Spectral:ital,wght@0,300;0,400;0,600;1,300;1,400"
    "&family=IBM+Plex+Mono:wght@400;500"
    "&display=swap"
)
# Sans un navigateur dans l'en-tete, Google renvoie du `woff` d'il y a dix ans
# au lieu du `woff2` qui pese trois fois moins.
NAVIGATEUR = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
GARDE = {"latin", "latin-ext"}

ENTETE = """/* ============================================================================
   Les polices, servies depuis ce depot.

   Aucun appel reseau ne part d'une page de relecture : ni Google Fonts, ni
   personne. D'abord parce qu'une page de relecture n'a pas a dire a un tiers
   qui relit quoi et quand ; ensuite parce qu'un chargement distant fait danser
   le texte au premier affichage, et qu'on s'installe ici pour des heures.

   Seuls les sous-ensembles « latin » et « latin-ext » sont embarques : le
   corpus est francais. Les quelques marqueurs grecs du corpus (alpha, beta,
   gamma) retombent sur une police systeme — ils ne sont pas du texte a lire.

   SIL Open Font License 1.1 pour les trois familles. Voir polices/LICENCES.md.

   Produit par `outils/polices.py` — ne pas editer a la main.
   ========================================================================= */

"""


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--sortie", type=Path, default=RACINE / "polices")
    ap.add_argument("--css", type=Path, default=RACINE / "css" / "polices.css")
    args = ap.parse_args(argv)

    requete = urllib.request.Request(REQUETE, headers={"User-Agent": NAVIGATEUR})
    try:
        with urllib.request.urlopen(requete, timeout=30) as r:
            css = r.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  Google Fonts injoignable ({e}) : les polices en place restent", file=sys.stderr)
        return 1

    # Chaque bloc est precede du nom de son sous-ensemble, en commentaire.
    blocs = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S)
    args.sortie.mkdir(parents=True, exist_ok=True)

    regles, pris = [], 0
    for sous, bloc in blocs:
        if sous not in GARDE:
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", bloc).group(1)
        poids = re.search(r"font-weight:\s*(\d+)", bloc).group(1)
        style = re.search(r"font-style:\s*(\w+)", bloc).group(1)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", bloc).group(1)
        plage = re.search(r"unicode-range:\s*([^;]+);", bloc).group(1)

        italique = "-italique" if style == "italic" else ""
        nom = f"{fam.lower().replace(' ', '-')}-{poids}{italique}-{sous}.woff2"
        cible = args.sortie / nom
        if not cible.exists():
            with urllib.request.urlopen(url, timeout=30) as r:
                cible.write_bytes(r.read())
        pris += 1
        regles.append(
            f"@font-face {{\n"
            f"  font-family: '{fam}';\n"
            f"  font-style: {style};\n"
            f"  font-weight: {poids};\n"
            f"  font-display: swap;\n"
            f"  src: url('../polices/{nom}') format('woff2');\n"
            f"  unicode-range: {plage};\n}}\n"
        )

    if not regles:
        print("  aucun sous-ensemble latin trouve : la reponse a change de forme", file=sys.stderr)
        return 1

    args.css.write_text(ENTETE + "\n".join(regles), encoding="utf-8")
    poids = sum(f.stat().st_size for f in args.sortie.glob("*.woff2"))
    print(f"  {pris} fichier(s), {poids // 1024} Ko -> {args.sortie}")
    print(f"  {args.css}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
