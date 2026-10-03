/* ============================================================================
   Le sommaire. Charge `data/index.json` et dresse la grille des arcanes.

   Tout le travail lourd a deja ete fait hors ligne par
   `generer_relecture.py` : ici on affiche, on filtre, on se souvient. Le
   fichier d'entree pese 48 Ko, donc pas de pagination ni de chargement
   paresseux — ce serait de la complexite pour rien.
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

/** Ce que le visiteur a marque comme lu. Local a son navigateur, et c'est dit
 *  en toutes lettres dans le pied de page : ce n'est pas l'etat du projet. */
function lus() {
  try {
    return new Set(JSON.parse(localStorage.getItem(RANGEMENT) || "[]"));
  } catch {
    return new Set(); // navigation privee, stockage bloque : on continue sans.
  }
}

function carte(s, dejaLus) {
  const cle = `${s.zone}__${s.nom}`;
  const lu = dejaLus.has(cle);
  const voix = s.locuteurs.slice(0, 4);
  const reste = s.locuteurs.length - voix.length;

  return `<li>
    <a class="carte" href="lecture.html?s=${encodeURIComponent(cle)}"
       data-etat="${lu ? "lu" : "neuf"}">
      <div class="carte__haut">
        <div>
          <span class="carte__zone">${ZONES[s.zone] || s.zone}</span>
          <span class="carte__nom">${s.nom}</span>
        </div>
      </div>
      <div class="carte__voix">
        ${voix.map((v) => `<span class="puce">${v}</span>`).join("")}
        ${reste > 0 ? `<span class="puce">+${reste}</span>` : ""}
      </div>
      <div class="carte__bas">
        <span class="carte__compte"><b>${s.repliques}</b> répliques</span>
        <span class="carte__etat">${lune(lu ? "pleine" : "neuve")} ${lu ? "relu" : "à lire"}</span>
      </div>
    </a>
  </li>`;
}

async function demarrer() {
  const grille = document.getElementById("grille");
  const champ = document.getElementById("cherche");
  const barreZones = document.getElementById("zones");
  const compteur = document.getElementById("compteur");

  let scripts;
  try {
    scripts = await (await fetch("data/index.json")).json();
  } catch {
    grille.innerHTML = `<li class="vide">Les données n'ont pas pu être chargées.
      Si vous ouvrez ce fichier directement depuis le disque, passez par un petit
      serveur local : <code>python -m http.server</code>.</li>`;
    return;
  }

  const total = scripts.reduce((n, s) => n + s.repliques, 0);
  compteur.innerHTML =
    `<b>${scripts.length}</b> scripts<br><b>${total.toLocaleString("fr-FR")}</b> répliques`;

  const zonesPresentes = [...new Set(scripts.map((s) => s.zone))];
  let zoneActive = null;

  barreZones.innerHTML = zonesPresentes
    .map((z) => `<button class="zone" type="button" data-zone="${z}" aria-pressed="false">${ZONES[z] || z}</button>`)
    .join("");

  function peindre() {
    const q = champ.value.trim().toLowerCase();
    const dejaLus = lus();
    const vus = scripts.filter((s) => {
      if (zoneActive && s.zone !== zoneActive) return false;
      if (!q) return true;
      return (
        s.nom.toLowerCase().includes(q) ||
        s.locuteurs.some((v) => v.toLowerCase().includes(q))
      );
    });

    grille.innerHTML = vus.length
      ? vus.map((s) => carte(s, dejaLus)).join("")
      : `<li class="vide">Rien ne correspond à « ${champ.value} ».</li>`;

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

  let minuteur;
  champ.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(peindre, 120);
  });

  peindre();
}

demarrer();
