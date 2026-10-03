/* ============================================================================
   Le sommaire. Charge `data/index.json`, dresse la grille des arcanes, et dit
   qui est deja passe par la.

   Deux memoires se superposent, et il faut les distinguer sans y penser :

     l'etat DU PROJET    `data/etat.json`, fabrique a partir des issues de
                         P1-FR-PSP. Tout le monde voit la meme chose.
     l'etat DU VISITEUR  `localStorage`, son fil a lui, qui ne regarde
                         personne d'autre.

   Un sceau dore dit « quelqu'un s'en occupe », un sceau plein dit « c'est
   fait ». Sans cela, trois personnes relisent le meme script et personne ne
   touche aux cent autres.

   Tout le travail lourd a deja ete fait hors ligne par `outils/generer.py` :
   ici on affiche, on filtre, on se souvient. Le fichier d'entree pese 50 Ko,
   donc pas de pagination ni de chargement paresseux — ce serait de la
   complexite pour rien.
   ========================================================================= */

import { lune } from "./lune.js";

const RANGEMENT = "p1fr-relecture-lus";

const ZONES = {
  dialogues: "Dialogues",
  negociations: "Négociations",
  eboot: "Menus",
  donjons: "Donjons",
  noms: "Noms",
};

/** Ce que le visiteur a marque comme lu. Local a son navigateur. */
function lus() {
  try {
    return new Set(JSON.parse(localStorage.getItem(RANGEMENT) || "[]"));
  } catch {
    return new Set(); // navigation privee, stockage bloque : on continue sans.
  }
}

/** L'etat d'un script, du plus fort au plus faible.
 *
 *  Ce que dit le depot l'emporte sur ce que dit le navigateur : si une issue
 *  de relecture a ete traitee, le script est relu pour tout le monde, meme
 *  pour quelqu'un qui n'y a jamais mis les pieds.
 */
function etatDe(cle, partage, mes) {
  const f = partage[cle];
  if (f && f.relu) return "relu";
  if (f && f.en_cours) return "cours";
  if (mes.has(cle)) return "mien";
  return "neuf";
}

const LIBELLE = {
  relu: "relu",
  cours: "en cours",
  mien: "lu par vous",
  neuf: "à lire",
};
// `lune.js` ne dessine que trois phases : neuve, croissante, pleine. Une
// relecture en cours et une lecture personnelle sont toutes deux « commencee,
// pas finie » — la meme phase, et la couleur les distingue.
const LUNE = { relu: "pleine", cours: "croissante", mien: "croissante", neuf: "neuve" };

function echappe(t) {
  return String(t).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
  );
}

function carte(s, partage, mes) {
  const cle = `${s.zone}__${s.nom}`;
  const etat = etatDe(cle, partage, mes);
  const fiche = partage[cle];
  const voix = s.locuteurs.slice(0, 4);
  const reste = s.locuteurs.length - voix.length;

  // Qui, et ou en discuter : une relecture signee invite a reprendre le fil,
  // une relecture anonyme ne dit rien a personne.
  const issues = (fiche && fiche.issues) || [];
  const derniere = issues[issues.length - 1];
  const signature =
    derniere && (etat === "relu" || etat === "cours")
      ? `<span class="carte__qui">${echappe(derniere.qui)}</span>`
      : "";

  return `<li>
    <a class="carte" href="lecture.html?s=${encodeURIComponent(cle)}"
       data-etat="${etat}">
      <div class="carte__haut">
        <div>
          <span class="carte__zone">${ZONES[s.zone] || s.zone}</span>
          <span class="carte__nom">${echappe(s.nom)}</span>
        </div>
        ${signature}
      </div>
      <div class="carte__voix">
        ${voix.map((v) => `<span class="puce">${echappe(v)}</span>`).join("")}
        ${reste > 0 ? `<span class="puce">+${reste}</span>` : ""}
      </div>
      <div class="carte__bas">
        <span class="carte__compte"><b>${s.lisibles == null ? s.repliques : s.lisibles}</b> répliques</span>
        <span class="carte__etat">${lune(LUNE[etat])} ${LIBELLE[etat]}</span>
      </div>
    </a>
  </li>`;
}

async function demarrer() {
  const grille = document.getElementById("grille");
  const champ = document.getElementById("cherche");
  const barreZones = document.getElementById("zones");
  const compteur = document.getElementById("compteur");
  const bPriorite = document.getElementById("priorite");

  let scripts;
  try {
    scripts = await (await fetch("data/index.json")).json();
  } catch {
    grille.innerHTML = `<li class="vide">Les données n'ont pas pu être chargées.
      Si vous ouvrez ce fichier directement depuis le disque, passez par un petit
      serveur local : <code>python -m http.server</code>.</li>`;
    return;
  }

  // L'etat partage est un bonus : un sommaire sans sceaux reste utilisable,
  // un sommaire qui ne charge pas ne l'est pas.
  let partage = {};
  try {
    partage = (await (await fetch("data/etat.json")).json()).scripts || {};
  } catch {
    /* pas d'etat publie encore : toutes les cartes restent « a lire » */
  }

  const total = scripts.reduce((n, s) => n + (s.lisibles == null ? s.repliques : s.lisibles), 0);
  const relus = scripts.filter((s) => (partage[`${s.zone}__${s.nom}`] || {}).relu).length;
  const cours = scripts.filter((s) => (partage[`${s.zone}__${s.nom}`] || {}).en_cours).length;
  compteur.innerHTML =
    `<b>${relus}</b> relus sur <b>${scripts.length}</b><br>` +
    `<b>${total.toLocaleString("fr-FR")}</b> répliques` +
    (cours ? `<br><span class="compteur__cours">${cours} en cours</span>` : "");

  const zonesPresentes = [...new Set(scripts.map((s) => s.zone))];
  let zoneActive = null;
  let seulementNeufs = false;

  barreZones.innerHTML = zonesPresentes
    .map(
      (z) =>
        `<button class="zone" type="button" data-zone="${z}" aria-pressed="false">${ZONES[z] || z}</button>`
    )
    .join("");

  function peindre() {
    const q = champ.value.trim().toLowerCase();
    const mes = lus();
    const vus = scripts.filter((s) => {
      if (zoneActive && s.zone !== zoneActive) return false;
      if (seulementNeufs) {
        const e = etatDe(`${s.zone}__${s.nom}`, partage, mes);
        if (e === "relu" || e === "cours") return false;
      }
      if (!q) return true;
      return (
        s.nom.toLowerCase().includes(q) ||
        s.locuteurs.some((v) => v.toLowerCase().includes(q))
      );
    });

    grille.innerHTML = vus.length
      ? vus.map((s) => carte(s, partage, mes)).join("")
      : `<li class="vide">Rien ne correspond à « ${echappe(champ.value)} ».</li>`;

    // La cascade : on ne la joue que sur les premieres cartes, sinon le bas de
    // la grille se fait attendre pour rien.
    grille.querySelectorAll(".carte").forEach((c, i) => {
      if (i < 24) c.style.animationDelay = `${Math.min(i * 22, 500)}ms`;
      else c.style.animation = "none";
    });
  }

  barreZones.addEventListener("click", (e) => {
    const b = e.target.closest(".zone");
    if (!b) return;
    zoneActive = zoneActive === b.dataset.zone ? null : b.dataset.zone;
    barreZones.querySelectorAll(".zone").forEach((x) => {
      x.setAttribute("aria-pressed", String(x.dataset.zone === zoneActive));
    });
    peindre();
  });

  bPriorite.addEventListener("click", () => {
    seulementNeufs = !seulementNeufs;
    bPriorite.setAttribute("aria-pressed", String(seulementNeufs));
    peindre();
  });

  let minuteur;
  champ.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(peindre, 120);
  });

  peindre();
}

demarrer();
