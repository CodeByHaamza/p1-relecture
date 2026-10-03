/* ============================================================================
   Comment une replique devient du HTML.

   A part, et non dans `lecture.js`, pour une raison precise : c'est la piece
   qu'il faut pouvoir VERIFIER. Le jeu ne renvoie jamais a la ligne tout seul,
   donc la facon dont on decoupe les lignes decide de ce qu'un relecteur croit
   voir. Si ce decoupage ne correspond pas a celui que `mesure.js` mesure, la
   page montre trois lignes et en contrôle quatre — et personne ne s'en
   apercoit. `outils/verifier_rendu.mjs` compare les deux sur tout le corpus.
   ========================================================================= */

export function echappe(t) {
  return String(t == null ? "" : t).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]
  );
}

/** Ce que chaque code de fin de ligne fait a la boite de dialogue.
 *
 *  Le jeu ne renvoie jamais a la ligne tout seul : ces codes sont les SEULS
 *  retours a la ligne du dialogue. Les rendre en pastille au milieu du texte,
 *  et laisser la fenetre couper le reste, c'etait melanger les coupures du jeu
 *  avec celles du navigateur — un relecteur ne pouvait pas voir ou le jeu
 *  coupe, ce qui est pourtant la seule chose qu'il doit verifier.
 */
const FINS = {
  "{SAUT}": { classe: "fin--saut", quoi: "saut de ligne" },
  "{PAGE}": { classe: "fin--page", quoi: "la boîte se vide, nouvelle page" },
  "{FERME}": { classe: "fin--ferme", quoi: "la boîte se referme" },
  "{ATTENTE}": { classe: "fin--attente", quoi: "attend une touche" },
  "(*SPEAKER*)": { classe: "fin--qui", quoi: "cadre du nom de celui qui parle" },
  "(*RESPONSE*)": { classe: "fin--reponse", quoi: "réponse suivante" },
};

/** Une replique decoupee comme le jeu la dispose : une entree par ligne.
 *
 *  Le joint testable. Chaque ligne porte ses morceaux et le code qui l'a
 *  terminee ; `texte()` en rend le texte lisible, et c'est ce texte qu'on
 *  compare a ce que `mesure.js` mesure. Tant qu'on passait par le HTML, la
 *  verification revenait a redefaire ce qu'on venait de faire — avec les memes
 *  erreurs des deux cotes.
 */
export function decouper(segments) {
  const lignes = [];
  let courante = [];

  const fermer = (fin) => {
    // Une ligne vide entre deux codes n'est pas une ligne : le jeu enchaine.
    if (courante.length || fin) lignes.push({ bouts: courante, fin });
    courante = [];
  };

  for (const s of segments || []) {
    if (s.t) courante.push({ sorte: "texte", v: s.t });
    // `[0000]` est une espace, pas un code : d'ou `sorte: "espace"`, qui se
    // rend comme une espace et se compte comme une espace.
    else if (s.e) courante.push({ sorte: "espace", v: " " });
    else if (s.nl) fermer(s.nl);
    // `{PAUSE}` marque un temps, pas une fin : le texte continue sur la ligne.
    else if (s.p) courante.push({ sorte: "pause", v: s.p });
    // Les autres codes sont des substitutions — le nom du heros, un nombre.
    // Ils restent visibles meme quand on masque la machinerie, sinon la phrase
    // n'a plus de sens.
    else courante.push({ sorte: "code", v: s.j });
  }
  fermer(null);
  return lignes;
}

/** Le texte d'une ligne, sans les codes : ce que le jeu dessinera. */
export function texte(ligne) {
  return ligne.bouts
    .filter((b) => b.sorte === "texte" || b.sorte === "espace")
    .map((b) => b.v)
    .join("");
}

/** Une replique rendue comme le jeu la dispose : une ligne par ligne.
 *
 *  Les lignes du jeu font au plus une quarantaine de signes et la colonne en
 *  tient soixante-deux : elles ne se recoupent donc jamais, et ce qu'on voit a
 *  l'ecran est ce que le jeu affichera.
 */
export function enHtml(segments) {
  return decouper(segments)
    .map(({ bouts, fin }) => {
      const corps = bouts
        .map((b) => {
          if (b.sorte === "texte") return echappe(b.v);
          // Un pointille tres pale sous l'espace ecrite en octets, pour qu'on
          // ne la prenne pas pour un oubli de frappe dans « Salle des profs ».
          if (b.sorte === "espace")
            return `<span class="espace-brut" title="espace, écrite en octets"> </span>`;
          const quoi = b.sorte === "pause" ? " jeton--pause" : "";
          return `<span class="jeton${quoi}">${echappe(b.v)}</span>`;
        })
        .join("");
      const f = fin ? FINS[fin] : null;
      const marque = f
        ? `<i class="fin ${f.classe}" title="${echappe(fin)} — ${f.quoi}" aria-hidden="true"></i>` +
          `<span class="jeton jeton--fin">${echappe(fin)}</span>`
        : "";
      return `<span class="ligne">${corps}${marque}</span>`;
    })
    .join("");
}
