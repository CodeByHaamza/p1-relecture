/* ============================================================================
   Le code de la page, joue sur toutes les donnees.

       node outils/verifier_page.mjs

   `verifier_donnees.py` rejoue la MEME arithmetique en Python ; c'est utile,
   mais c'est une transcription, et une transcription peut etre fidele a un
   calcul faux. Ici on importe `js/mesure.js` tel quel — le fichier que le
   navigateur executera — et on lui soumet les 24 500 repliques deja ecrites.

   Ce qu'on exige :

     1. aucune replique francaise deja posee ne doit etre refusee. La page
        dirait « cette ligne sera coupee » sur du travail valide, et une jauge
        qui crie a tort decourage plus qu'elle n'aide.
     2. la traduction actuelle doit avoir les memes jetons que l'anglais —
        sinon c'est la donnee qui est cassee, pas la page.
     3. remplacer une replique par elle-meme doit coûter zero octet a son bloc.

   Les deux verificateurs doivent dire la meme chose. S'ils divergent, l'un des
   deux mesure mal, et il faut le savoir avant les relecteurs.
   ========================================================================= */

import { readFileSync, readdirSync } from "node:fs";
import { verifier, mesureur } from "../js/mesure.js";

const lire = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const contraintes = lire("data/contraintes.json");
const index = lire("data/index.json");
const mesurer = mesureur(contraintes);

let lues = 0;
const refusees = [];
const jetonsCasses = [];
const coutsNonNuls = [];

for (const e of index) {
  const cle = `${e.zone}__${e.nom}`;
  const s = lire(`data/scripts/${cle}.json`);
  for (const r of s.repliques) {
    if (r.japonais || r.technique || !r.brut_fr) continue;
    lues++;
    r.zone = s.zone;

    // On propose la traduction actuelle : la page doit l'accepter telle quelle.
    const v = verifier(r.brut_fr, r, contraintes, mesurer);
    if (v.largeur.etat === "deborde") {
      refusees.push([v.largeur.px - v.largeur.limite, e.zone, r.id, v.largeur.texte]);
    }
    if (!v.jetons.ok) jetonsCasses.push([r.id, v.jetons.texte]);
    if (v.bloc.connu && v.bloc.cout !== 0) coutsNonNuls.push([r.id, v.bloc.cout]);
  }
}

const dit = (s) => process.stdout.write(s + "\n");
dit(`  ${index.length} scripts, ${lues} repliques francaises soumises a js/mesure.js`);
dit(`  limites : ${JSON.stringify(contraintes.limites_px)}`);
dit(`  ${Object.keys(contraintes.marges_bloc).length} marges de bloc`);

let mauvais = 0;
for (const [titre, liste, forme] of [
  ["refusee(s) alors qu'elles sont deja en jeu", refusees, (x) => `+${x[0]} px  [${x[1]}] ${x[2]}  ${x[3]}`],
  ["dont les jetons ne suivent pas l'anglais", jetonsCasses, (x) => `${x[0]}  ${x[1]}`],
  ["dont se remplacer soi-meme coute des octets", coutsNonNuls, (x) => `${x[0]}  ${x[1]} o`],
]) {
  if (!liste.length) continue;
  mauvais += liste.length;
  dit(`\n  ${liste.length} replique(s) ${titre} :`);
  for (const x of liste.slice(0, 6)) dit(`    ${forme(x)}`);
}

if (mauvais) process.exit(1);
dit("\n  la page accepte tout le francais deja ecrit : elle ne criera pas a tort");
