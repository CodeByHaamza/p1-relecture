import { readFileSync } from "node:fs";
import { decouper, texte } from "../js/rendu.js";
import { lignesAffichees, estAffichee } from "../js/mesure.js";

const lire = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

/** Ce que le moteur remplace avant d'encoder. `mesure.js` applique ces
 *  substitutions, la page montre le texte tel qu'il est ecrit : on compare
 *  donc a cette substitution pres. */
const REMPLACE = [
  ["…", "..."], ["’", "'"], ["‘", "'"],
  ["“", '"'], ["”", '"'], ["—", "-"], ["–", "-"],
];
const commeLeMoteur = (s) => REMPLACE.reduce((t, [a, b]) => t.split(a).join(b), s);

const index = lire("data/index.json");
let vues = 0;
const comptes = [];
const textes = [];

for (const e of index) {
  const s = lire(`data/scripts/${e.zone}__${e.nom}.json`);
  for (const r of s.repliques) {
    for (const [cote, segments, brut] of [
      ["fr", r.fr, r.brut_fr],
      ["en", r.en, r.brut_en],
    ]) {
      if (!brut) continue;
      vues++;

      // Les lignes que la page montre, et celles que les jauges mesurent.
      // Des deux cotes on ne garde que ce que le jeu affiche vraiment.
      const montrees = decouper(segments)
        .map((l) => commeLeMoteur(texte(l)).trim())
        .filter((l) => l && estAffichee(l));
      const mesurees = lignesAffichees(brut)
        .map((l) => l.trim())
        .filter((l) => l && estAffichee(l));

      if (montrees.length !== mesurees.length) {
        comptes.push([r.id, cote, montrees.length, mesurees.length]);
        continue;
      }
      for (let i = 0; i < montrees.length; i++) {
        if (montrees[i] !== mesurees[i]) {
          textes.push([r.id, cote, i, montrees[i], mesurees[i]]);
        }
      }
    }
  }
}

const dit = (s) => process.stdout.write(s + "\n");
dit(`  ${index.length} scripts, ${vues} textes rendus puis remesures`);

let mauvais = 0;
if (comptes.length) {
  mauvais += comptes.length;
  dit(`\n  ${comptes.length} texte(s) dont le nombre de lignes diverge :`);
  for (const [id, cote, m, v] of comptes.slice(0, 8)) {
    dit(`    ${id} [${cote}]  montrees ${m}, mesurees ${v}`);
  }
}
if (textes.length) {
  mauvais += textes.length;
  dit(`\n  ${textes.length} ligne(s) dont le texte diverge :`);
  for (const [id, cote, i, a, b] of textes.slice(0, 8)) {
    dit(`    ${id} [${cote}] ligne ${i}\n      montree  ${JSON.stringify(a)}\n      mesuree  ${JSON.stringify(b)}`);
  }
}

if (mauvais) process.exit(1);
dit("\n  la page montre exactement les lignes qu'elle mesure");
