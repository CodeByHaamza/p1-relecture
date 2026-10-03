/* ============================================================================
   Les trois contraintes du jeu, verifiees dans la page.

   C'est ce qui separe cet outil d'un simple formulaire : le relecteur sait
   AVANT d'envoyer si sa proposition tient. Rien n'est devine ici — tout vient
   de `data/contraintes.json`, produit depuis le jeu lui-meme.

     1. le nombre de {SAUT} doit etre identique a l'anglais ;
     2. chaque ligne affichee doit tenir dans la boite, en PIXELS ;
     3. le bloc auquel la replique appartient a une marge, et le cout de la
        replique y est multiplie par son nombre d'occurrences.

   La troisieme est celle qu'on oublie : une replique peut etre juste a elle
   seule et faire quand meme tomber tout son fichier en anglais dans le jeu.
   ========================================================================= */

export const JETON = /(\{[A-Z]+\}|\(\*[^*]*\*\)|\[[0-9A-Fa-f]{4}\])/g;

// Ce que le moteur remplace avant d'encoder : les compter autrement serait
// mesurer un texte que le jeu n'affiche pas.
const REMPLACE = [
  ["…", "..."], ["’", "'"], ["‘", "'"],
  ["“", '"'], ["”", '"'], ["—", "-"], ["–", "-"],
];

// Ce qui termine une ligne a l'ecran. {PAUSE} n'en fait pas partie : le texte
// continue sur la meme ligne apres la pause. `(*RESPONSE*)` si : une entree de
// negociation en contient plusieurs, et chacune s'affiche a son tour.
const COUPE = /\{SAUT\}|\{PAGE\}|\{FERME\}|\{ATTENTE\}|\(\*SPEAKER\*\)|\(\*RESPONSE\*\)/g;

export function nu(texte) {
  let t = texte || "";
  for (const [a, b] of REMPLACE) t = t.split(a).join(b);
  return t.replace(JETON, "");
}

export function jetons(texte) {
  return (texte || "").match(JETON) || [];
}

export function lignesAffichees(texte) {
  let t = texte || "";
  for (const [a, b] of REMPLACE) t = t.split(a).join(b);
  return t.split(COUPE).map((m) => m.replace(JETON, ""));
}

/** Construit un mesureur a partir de la table du jeu.
 *
 *  `avances_car` donne, pour chaque caractere, son avance en pixels telle que
 *  le jeu la calcule : la largeur du glyphe plus un pixel, et cinq pixels pour
 *  l'espace. Les quelques caracteres absents de la table sont des marqueurs de
 *  style (le beta qui precede un nom d'objet) ou des symboles hors plage : ils
 *  ne poussent rien a l'ecran, donc ils valent zero. Les compter comme un
 *  espace gonflait la mesure sur toutes les lignes qui nomment un objet.
 */
export function mesureur(contraintes) {
  const avances = contraintes.avances_car || {};
  const espace = contraintes.espace_px || 5;
  return function mesurer(ligne) {
    let total = 0;
    for (const c of ligne) {
      if (c === " ") { total += espace; continue; }
      total += Object.hasOwn(avances, c) ? avances[c] : 0;
    }
    return total;
  };
}

/** Cette ligne est-elle rendue a l'ecran ?
 *
 *  Un remplissage d'espaces appartient a un bloc de mise en scene, et une
 *  ligne de plus de soixante signes n'est pas une ligne : la boite n'en montre
 *  pas tant. Dans les negociations, une entree peut contenir plusieurs textes
 *  dont on ne modelise pas la decoupe interne — mieux vaut ne rien dire que
 *  dire faux. Meme regle que `largeur_pixels.py` cote depot.
 */
export function estAffichee(ligne) {
  if (/\s{6,}/.test(ligne)) return false;
  const net = ligne.trim();
  return net.length > 0 && net.length <= 60;
}

/** Les trois verdicts pour une proposition. */
export function verifier(propose, replique, contraintes, mesurer) {
  const attendus = jetons(replique.brut_en);
  const donnes = jetons(propose);
  const memesJetons =
    attendus.length === donnes.length && attendus.every((j, i) => j === donnes[i]);

  const limite = contraintes.limites_px[replique.zone] || 375;
  const lignes = lignesAffichees(propose)
    .map((l) => ({ texte: l.trim(), px: mesurer(l.trim()) }))
    .filter((l) => l.texte.length && estAffichee(l.texte));
  const pire = lignes.reduce((m, l) => (l.px > m ? l.px : m), 0);

  // Le cout en octets, comme `budget_blocs.py` : l'ecart a l'anglais, fois les
  // occurrences, fois deux octets par caractere.
  const ecartAvant = nu(replique.brut_fr).length - nu(replique.brut_en).length;
  const ecartApres = nu(propose).length - nu(replique.brut_en).length;
  const coutOctets = 2 * (ecartApres - ecartAvant) * (replique.occ || 1);
  const marge = contraintes.marges_bloc[replique.bloc];

  return {
    jetons: {
      ok: memesJetons,
      attendus,
      donnes,
      texte: memesJetons
        ? `${donnes.length} jeton(s), conformes`
        : `attendu ${attendus.length}, reçu ${donnes.length}`,
    },
    largeur: {
      px: pire,
      limite,
      etat: pire > limite ? "deborde" : pire > limite * 0.93 ? "serre" : "tient",
      texte: `${pire} / ${limite} px`,
    },
    bloc:
      marge === undefined
        ? { connu: false, texte: "bloc non mesuré" }
        : {
            connu: true,
            cout: coutOctets,
            marge,
            etat: coutOctets > marge ? "deborde" : coutOctets > marge - 8 ? "serre" : "tient",
            texte:
              coutOctets <= 0
                ? `${-coutOctets} octet(s) rendus au bloc`
                : `${coutOctets} / ${marge} octet(s) de marge`,
          },
  };
}
