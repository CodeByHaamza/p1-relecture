#!/usr/bin/env python3
"""Qui a deja relu quoi ? La reponse vit sur P1-FR-PSP, pas dans le navigateur.

    python outils/etat_relecture.py

Le probleme
-----------

Un relecteur qui ouvre le sommaire doit voir d'un coup d'oeil ce qui est deja
passe entre d'autres mains. Sinon trois personnes relisent le meme script et
personne ne touche aux cent autres.

Le `localStorage` ne peut pas le dire : il ne connait qu'un navigateur. L'etat
partage doit donc venir d'un endroit que tout le monde voit — et cet endroit
existe deja, c'est le depot de la traduction. Chaque relecture y laisse une
issue intitulee `Relecture : <script>`, ouverte par le site lui-meme.

  issue fermee    le script a ete relu et les retours sont traites
  issue ouverte   quelqu'un s'en occupe en ce moment, ne pas doubler
  rien            personne n'y est encore passe

On ne demande donc rien de plus aux relecteurs que ce qu'ils font deja, et
l'etat survit a un changement de machine.

Sortie : `data/etat.json`, relu par le sommaire. Sans reseau, le script ne
touche a rien et laisse l'ancien fichier en place — un sommaire sans sceaux
reste utilisable, un sommaire qui ne charge pas ne l'est pas.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DEPOT = "CodeByHaamza/P1-FR-PSP"
# Le titre que `js/lecture.js` met dans l'issue qu'il prepare.
# « Relecture : X » mais aussi « Relecture de `X` » : un relecteur
# reecrit le titre, et #133 est passee a cote du suivi pour un
# deux-points manquant.
TITRE = re.compile(r"^\s*Relecture\s*(?::|de)\s*(.+?)\s*$", re.I)


def cle(nom: str) -> str:
    """Un nom de script reduit a ce qui l'identifie, accents et casse en moins.

    Le titre de l'issue est tape par un humain qui peut ajouter une precision
    ou perdre un accent en chemin : comparer les formes brutes raterait la
    moitie des correspondances.
    """
    sans = unicodedata.normalize("NFKD", nom)
    sans = "".join(c for c in sans if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", sans.lower())


def issues(depot: str, jeton: str | None):
    """Toutes les issues du depot, fermees comprises. Les PR sont ecartees."""
    page, out = 1, []
    while page <= 10:  # garde-fou : on ne tourne pas en rond sur une API
        url = f"https://api.github.com/repos/{depot}/issues?state=all&per_page=100&page={page}"
        requete = urllib.request.Request(
            url, headers={"Accept": "application/vnd.github+json", "User-Agent": "p1-relecture"}
        )
        if jeton:
            requete.add_header("Authorization", f"Bearer {jeton}")
        with urllib.request.urlopen(requete, timeout=30) as r:
            lot = json.load(r)
        if not lot:
            break
        out += [i for i in lot if "pull_request" not in i]
        if len(lot) < 100:
            break
        page += 1
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--depot", default=DEPOT)
    ap.add_argument("--sortie", type=Path, default=RACINE / "data" / "etat.json")
    args = ap.parse_args(argv)

    index = json.loads((RACINE / "data" / "index.json").read_text(encoding="utf-8"))
    # Deux scripts de zones differentes peuvent porter le meme nom : on garde
    # la liste des cles de sommaire qui repondent a un nom donne.
    par_nom: dict[str, list[str]] = {}
    for e in index:
        par_nom.setdefault(cle(e["nom"]), []).append(f"{e['zone']}__{e['nom']}")

    jeton = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    try:
        brut = issues(args.depot, jeton)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"  GitHub injoignable ({e}) : on garde l'etat precedent", file=sys.stderr)
        return 0

    etat: dict[str, dict] = {}
    inconnues = []
    for i in brut:
        m = TITRE.match(i.get("title") or "")
        if not m:
            continue
        candidats = par_nom.get(cle(m.group(1)))
        if not candidats:
            # Le titre a ete reecrit a la main au point de ne plus designer un
            # script : mieux vaut le dire que de l'attribuer au hasard.
            inconnues.append((i["number"], i["title"]))
            continue
        for k in candidats:
            fiche = etat.setdefault(k, {"relu": False, "en_cours": False, "issues": []})
            fiche["issues"].append(
                {
                    "numero": i["number"],
                    "url": i["html_url"],
                    "qui": (i.get("user") or {}).get("login", ""),
                    "ouverte": i["state"] == "open",
                    "le": (i.get("closed_at") or i["created_at"])[:10],
                }
            )
            if i["state"] == "open":
                fiche["en_cours"] = True
            else:
                fiche["relu"] = True

    args.sortie.write_text(
        json.dumps(
            {
                "_source": f"issues « Relecture : … » de {args.depot}",
                "_regle": "issue fermee = relu ; issue ouverte = quelqu'un s'en occupe",
                "depot": args.depot,
                "scripts": etat,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    relus = sum(1 for f in etat.values() if f["relu"])
    cours = sum(1 for f in etat.values() if f["en_cours"])
    print(f"  {len(brut)} issues lues sur {args.depot}")
    print(f"  {relus} script(s) relus, {cours} en cours, sur {len(index)}")
    for numero, titre in inconnues[:5]:
        print(f"  issue #{numero} sans script reconnu : {titre!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
