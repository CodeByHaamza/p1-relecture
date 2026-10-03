"""Le contrat entre le generateur et la page tient-il ?

    python verifier_donnees.py

Ce que la page LIT doit exister, et ce qu'elle lit ne doit pas la faire crier
sur du travail valide. On verifie donc deux choses sur les donnees publiees :

  1. `contraintes.json` porte tous les champs que `js/mesure.js` va chercher ;
  2. aucune replique francaise deja en jeu ne depasse la limite de sa zone.

Le decoupage en lignes et le retrait des jetons viennent de `outils/generer.py`.
Ils y etaient recopies, et la copie a pris du retard : elle ignorait le
separateur de repliques des negociations et signalait vingt lignes valides. Une
regle de decoupage vit a UN endroit — ici on l'importe.

`outils/verifier_rendu.mjs` et `outils/verifier_page.mjs` font l'autre moitie du
travail : ils executent le vrai code de la page, pas sa transcription.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI / "outils"))

# La console Windows tourne en cp1252 : afficher un caractere du corpus y leve
# une exception et fait echouer un outil qui n'avait rien trouve a redire.
# Ecrire en UTF-8, et remplacer ce que le terminal ne sait pas dessiner.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import generer  # noqa: E402  (le chemin n'existe qu'au-dessus)

DATA = ICI / "data"


def main():
    c = json.loads((DATA / "contraintes.json").read_text(encoding="utf-8"))
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))

    for champ in ("avances_car", "espace_px", "limites_px", "marges_bloc"):
        if champ not in c:
            print(f"  MANQUE contraintes.{champ}", file=sys.stderr)
            return 1
    av, espace = c["avances_car"], c["espace_px"]

    def mesurer(ligne):
        # Les quelques caracteres absents de la table sont des marqueurs de
        # style : ils ne poussent rien a l'ecran, donc zero. Meme regle que
        # `mesureur()` dans `js/mesure.js`.
        return sum(espace if ch == " " else av.get(ch, 0) for ch in ligne)

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
            for ch in generer.nu(r["brut_fr"]):
                if ch != " " and ch not in av:
                    manquants.add(ch)
            for ligne in generer.lignes_affichees(r["brut_fr"]):
                if not ligne or not generer.est_affichee(ligne):
                    continue
                px = mesurer(ligne)
                if px > limite:
                    pires.append((px - limite, e["zone"], r["id"], ligne))

    print(f"  {len(index)} scripts, {len(av)} caracteres mesures")
    print(f"  limites : {c['limites_px']}")
    print(f"  marges de bloc connues : {len(c['marges_bloc'])}")

    if manquants:
        print(f"  {len(manquants)} caractere(s) hors table, comptes pour zero : {sorted(manquants)[:14]}")
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
