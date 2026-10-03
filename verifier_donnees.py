"""Le contrat entre le generateur et la page tient-il ?

On ne peut pas ouvrir un navigateur ici, mais on peut rejouer en Python
exactement ce que `js/mesure.js` calcule, sur les memes fichiers. Si les deux
donnent la meme chose, c'est que la page dira la verite.

    python verifier_donnees.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# La console Windows tourne en cp1252 : afficher un caractere du corpus y leve
# une exception et fait echouer un outil qui n'avait rien trouve a redire.
# Ecrire en UTF-8, et remplacer ce que le terminal ne sait pas dessiner.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

DATA = Path("data")
JETON = re.compile(r"(\{[A-Z]+\}|\(\*[^*]*\*\)|\[[0-9A-Fa-f]{4}\])")
COUPE = re.compile(
    r"\{SAUT\}|\{PAGE\}|\{FERME\}|\{ATTENTE\}|\(\*SPEAKER\*\)|\(\*RESPONSE\*\)"
)
ANCHOS = {"…": "...", "’": "'", "‘": "'", "“": '"', "”": '"', "—": "-", "–": "-"}
ESPACE_BRUT = re.compile(r"\[0000\]")  # l'espace des menus, ecrite en octets


def nu(t: str) -> str:
    t = ESPACE_BRUT.sub(" ", t or "")
    for a, b in ANCHOS.items():
        t = t.replace(a, b)
    return JETON.sub("", t)


def lignes(t: str):
    t = ESPACE_BRUT.sub(" ", t or "")
    for a, b in ANCHOS.items():
        t = t.replace(a, b)
    return [JETON.sub("", m).strip() for m in COUPE.split(t)]


def main():
    c = json.loads((DATA / "contraintes.json").read_text(encoding="utf-8"))
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    av, espace = c["avances_car"], c["espace_px"]

    # 1. le contrat : tout ce que la page lit doit exister
    for champ in ("avances_car", "espace_px", "limites_px", "marges_bloc"):
        if champ not in c:
            print(f"  MANQUE contraintes.{champ}", file=sys.stderr)
            return 1

    def mesurer(ligne):
        return sum(espace if ch == " " else av.get(ch, 0) for ch in ligne)

    # 2. aucune replique francaise deja posee ne doit sortir des limites :
    #    la page afficherait du rouge sur du travail valide.
    pires, manquants, sans_marge = [], set(), 0
    for e in index:
        cle = f"{e['zone']}__{e['nom']}"
        s = json.loads((DATA / "scripts" / f"{cle}.json").read_text(encoding="utf-8"))
        limite = c["limites_px"][e["zone"]]
        for r in s["repliques"]:
            if r["japonais"] or r.get("technique") or not r["brut_fr"]:
                continue
            if r["bloc"] not in c["marges_bloc"] and e["zone"] == "dialogues":
                sans_marge += 1
            for ch in nu(r["brut_fr"]):
                if ch != " " and ch not in av:
                    manquants.add(ch)
            for ligne in lignes(r["brut_fr"]):
                # Meme filtre que largeur_pixels.py : on ne mesure que ce que
                # le jeu affiche. Au-dela d'une soixantaine de signes, ce n'est
                # pas une ligne rendue.
                # Meme filtre que `largeur_pixels.py` et `js/mesure.js` : la
                # ligne arrive rognee, et le remplissage ne se juge donc que
                # sur son interieur.
                if not ligne or len(ligne) > 60 or re.search(r"\s{6,}", ligne):
                    continue
                px = mesurer(ligne)
                if px > limite:
                    pires.append((px - limite, e["zone"], r["id"], ligne))

    print(f"  {len(index)} scripts, {len(c['avances_car'])} caracteres mesures")
    print(f"  limites : {c['limites_px']}")
    print(f"  marges de bloc connues : {len(c['marges_bloc'])}")

    if manquants:
        print(f"  {len(manquants)} caractere(s) hors table : {sorted(manquants)[:14]}")
    if sans_marge:
        print(f"  {sans_marge} replique(s) de dialogue sans marge de bloc")
    if pires:
        print(f"\n  {len(pires)} ligne(s) deja posees depassent la limite :")
        for d, zone, rid, ligne in sorted(pires, reverse=True)[:6]:
            print(f"    +{d:>3} px  [{zone}] {rid}  {ligne[:60]!r}")
        return 1

    print("\n  aucune ligne posee ne depasse : la page ne criera pas sur du travail valide")
    return 0


if __name__ == "__main__":
    sys.exit(main())
