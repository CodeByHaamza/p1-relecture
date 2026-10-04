/* ============================================================================
   Qui a déjà relu quoi, et qui s'en occupe en ce moment.

   Deux sources, et l'ordre compte.

     `data/etat.json`   la base, fabriquée chaque jour par le workflow. Elle
                        couvre TOUT l'historique, ne demande aucun appel
                        réseau, et marche même si GitHub est injoignable.

     l'API GitHub       les issues les plus récentes, lues au chargement. Elle
                        sert à une seule chose, mais elle est décisive : qu'une
                        réservation se voie dans la SECONDE, et non au
                        lendemain.

   Pourquoi les deux. Un bouton « je prends ce script » dont le sceau
   n'apparaîtrait que le jour suivant ne réserve rien : deux personnes
   ouvriraient quand même le même script le même soir, ce qui est le problème
   qu'il est censé régler. Mais faire dépendre la page d'un appel réseau serait
   pire — elle doit s'ouvrir et se lire sans rien demander à personne.

   D'où : la base d'abord, l'API par-dessus, et un échec d'API qui ne se voit
   pas. Une page qui marche moins bien vaut mieux qu'une page qui ne marche pas.

   Un seul appel par chargement, via l'API de RECHERCHE et non la liste des
   issues. La différence n'est pas cosmétique : l'endpoint `/issues` rend aussi
   les pull requests, et ce dépôt en compte plus de cent vingt. Mesuré — sur
   cent entrées renvoyées, quatre-vingt-quinze étaient des PR. Les relectures
   auraient été noyées, et chassées de la première page à mesure que les
   propositions arrivent. La recherche, elle, ne rend que ce qu'on demande.

   Au-delà de cent relectures, les plus anciennes sortent de la réponse : elles
   sont dans la base, qui est faite pour ça.
   ========================================================================= */

const DEPOT = "CodeByHaamza/P1-FR-PSP";
const TITRE = /^\s*Relecture\s*:\s*(.+?)\s*$/i;

/** Un nom de script réduit à ce qui l'identifie : sans accents, sans casse,
 *  sans ponctuation. Le titre est tapé par un humain, qui peut ajouter une
 *  précision ou perdre un accent en chemin. Même règle que `etat_relecture.py`
 *  côté dépôt — deux normalisations différentes, et la moitié des issues ne
 *  retrouveraient plus leur script. */
export function cle(nom) {
  return (nom || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function fiche(etat, k) {
  return (etat[k] ||= { relu: false, en_cours: false, issues: [] });
}

/** Les issues de relecture vues à l'instant, superposées à la base. */
async function fraiches(etat, index) {
  const parNom = new Map();
  for (const e of index) {
    const liste = parNom.get(cle(e.nom)) || [];
    liste.push(`${e.zone}__${e.nom}`);
    parNom.set(cle(e.nom), liste);
  }

  const q = encodeURIComponent(`repo:${DEPOT} is:issue in:title Relecture`);
  const r = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=100`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`API ${r.status}`);

  let vues = 0;
  for (const issue of (await r.json()).items || []) {
    // `is:issue` écarte déjà les pull requests côté serveur ; on garde la
    // ceinture, parce qu'un sceau posé sur une PR serait invisible à déboguer.
    if (issue.pull_request) continue;
    // La recherche trouve « Relecture » n'importe où dans le titre ; seul un
    // titre de la forme « Relecture : <script> » désigne un script.
    const m = TITRE.exec(issue.title || "");
    if (!m) continue;
    const cibles = parNom.get(cle(m[1].split(/\s/)[0]));
    if (!cibles) continue;

    for (const k of cibles) {
      const f = fiche(etat, k);
      // On remplace ce que la base disait de CETTE issue : son état a pu
      // changer depuis, et c'est justement pour cela qu'on interroge.
      f.issues = f.issues.filter((x) => x.numero !== issue.number);
      f.issues.push({
        numero: issue.number,
        url: issue.html_url,
        qui: (issue.user || {}).login || "",
        ouverte: issue.state === "open",
        le: (issue.closed_at || issue.created_at || "").slice(0, 10),
      });
      f.relu = f.issues.some((x) => !x.ouverte);
      f.en_cours = f.issues.some((x) => x.ouverte);
      vues++;
    }
  }
  return vues;
}

/** L'état de relecture, le plus frais qu'on puisse obtenir sans rien exiger. */
export async function chargerEtat(index) {
  let etat = {};
  try {
    etat = (await (await fetch("data/etat.json")).json()).scripts || {};
  } catch {
    /* pas d'etat publie encore : toutes les cartes restent « a lire » */
  }
  try {
    await fraiches(etat, index || []);
  } catch {
    // Hors ligne, quota dépassé, GitHub en panne : la base suffit. On ne dit
    // rien — un avertissement que le visiteur ne peut pas corriger est du
    // bruit, et la page n'est pas moins utile pour autant.
  }
  return etat;
}

/** Le lien qui ouvre l'issue de réservation, préremplie. */
export function lienPrendre(nom, zone) {
  const titre = `Relecture : ${nom}`;
  const corps =
    `Je prends ce script en relecture.\n\n` +
    `Zone : ${zone}\n\n` +
    `Cette issue sert à dire que je m'en occupe, pour que personne ne le ` +
    `relise en double. Je posterai mes propositions ici, ou je la fermerai ` +
    `en disant qu'il n'y a rien à signaler.\n`;
  return (
    `https://github.com/${DEPOT}/issues/new` +
    `?title=${encodeURIComponent(titre)}&body=${encodeURIComponent(corps)}`
  );
}
