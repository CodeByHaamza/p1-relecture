/* ============================================================================
   La lecture d'un script, et l'editeur qui va avec.

   Parti pris : on lit d'abord, on corrige ensuite. Le francais tient la
   colonne, l'anglais ne se montre qu'a la demande — un relecteur qui lit deux
   colonnes en parallele ne lit ni l'une ni l'autre.
   ========================================================================= */

import { verifier, mesureur, jetons } from "./mesure.js";

const RANGEMENT_LUS = "p1fr-relecture-lus";
const RANGEMENT_PANIER = "p1fr-relecture-panier";
const DEPOT = "https://github.com/CodeByHaamza/P1-FR-PSP";

const ZONES = {
  dialogues: "Dialogues",
  negociations: "Négociations",
  eboot: "Menus",
  donjons: "Donjons",
  noms: "Noms",
};

const $ = (s) => document.querySelector(s);

/* --- le petit stockage local ------------------------------------------------ */
function lire(cle, defaut) {
  try {
    return JSON.parse(localStorage.getItem(cle)) ?? defaut;
  } catch {
    return defaut; // navigation privee, stockage bloque : on continue sans.
  }
}
function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* tant pis : la page marche sans memoire */
  }
}

/* --- rendu d'une replique --------------------------------------------------- */
function enHtml(segments) {
  return segments
    .map((s) => {
      if (s.t) return echappe(s.t);
      if (s.nl) return `<span class="jeton jeton--saut">${echappe(s.nl)}</span>\n`;
      if (s.p) return `<span class="jeton">${echappe(s.p)}</span>`;
      return `<span class="jeton">${echappe(s.j)}</span>`;
    })
    .join("");
}

function echappe(t) {
  return t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function portrait(r) {
  if (r.portrait) {
    const f = r.portrait.toLowerCase().replace("é", "e");
    return `<img class="portrait" src="img/portraits/${f}.webp" alt="" loading="lazy" width="56" height="56">`;
  }
  const lettre = (r.loc || "?").trim().charAt(0).toUpperCase();
  return `<div class="portrait portrait--lettre" aria-hidden="true">${echappe(lettre)}</div>`;
}

/* --- l'editeur -------------------------------------------------------------- */
function ouvrirEditeur(bloc, r, contraintes, mesurer, panier) {
  if (bloc.querySelector(".editeur")) return;
  bloc.dataset.ouvert = "oui";

  const depart = panier.get(r.id)?.propose ?? r.brut_fr;
  const ed = document.createElement("div");
  ed.className = "editeur";
  ed.innerHTML = `
    <textarea class="editeur__champ" spellcheck="true"
      aria-label="Proposer une autre traduction">${echappe(depart)}</textarea>
    <div class="jauges">
      <div class="jauge" data-jauge="jetons">
        <div class="jauge__titre"><span>Jetons</span><span class="jauge__valeur">—</span></div>
      </div>
      <div class="jauge" data-jauge="largeur">
        <div class="jauge__titre"><span>Largeur</span><span class="jauge__valeur">—</span></div>
        <div class="jauge__barre"><div class="jauge__remplie"></div></div>
      </div>
      <div class="jauge" data-jauge="bloc">
        <div class="jauge__titre"><span>Bloc ${echappe(r.bloc)}${r.occ > 1 ? ` ×${r.occ}` : ""}</span><span class="jauge__valeur">—</span></div>
        <div class="jauge__barre"><div class="jauge__remplie"></div></div>
      </div>
    </div>
    <div class="editeur__bas">
      <span class="editeur__note" data-note></span>
      <button class="bouton" type="button" data-annuler>Annuler</button>
      <button class="bouton bouton--fort" type="button" data-garder>Garder</button>
    </div>`;
  bloc.append(ed);

  const champ = ed.querySelector(".editeur__champ");
  const note = ed.querySelector("[data-note]");
  const garder = ed.querySelector("[data-garder]");

  function peindre() {
    const v = verifier(champ.value, r, contraintes, mesurer);

    const jj = ed.querySelector('[data-jauge="jetons"]');
    jj.dataset.etat = v.jetons.ok ? "tient" : "deborde";
    jj.querySelector(".jauge__valeur").textContent = v.jetons.texte;

    const jl = ed.querySelector('[data-jauge="largeur"]');
    jl.dataset.etat = v.largeur.etat;
    jl.querySelector(".jauge__valeur").textContent = v.largeur.texte;
    jl.querySelector(".jauge__remplie").style.width =
      `${Math.min(100, (v.largeur.px / v.largeur.limite) * 100)}%`;

    const jb = ed.querySelector('[data-jauge="bloc"]');
    jb.dataset.etat = v.bloc.connu ? v.bloc.etat : "";
    jb.querySelector(".jauge__valeur").textContent = v.bloc.texte;
    if (v.bloc.connu) {
      const part = v.bloc.marge > 0 ? (v.bloc.cout / v.bloc.marge) * 100 : v.bloc.cout > 0 ? 100 : 0;
      jb.querySelector(".jauge__remplie").style.width = `${Math.max(0, Math.min(100, part))}%`;
    }

    const bloquant =
      !v.jetons.ok || v.largeur.etat === "deborde" || (v.bloc.connu && v.bloc.etat === "deborde");
    garder.disabled = bloquant || champ.value.trim() === r.brut_fr.trim();
    note.textContent = bloquant
      ? !v.jetons.ok
        ? "Les codes du jeu doivent rester les mêmes, dans le même ordre."
        : v.largeur.etat === "deborde"
          ? "Cette ligne sera coupée à l'écran."
          : "Ce bloc n'a plus de place : tout le fichier retomberait en anglais."
      : champ.value.trim() === r.brut_fr.trim()
        ? "Identique à la traduction actuelle."
        : "Tient dans les trois contraintes.";
  }

  champ.addEventListener("input", peindre);
  peindre();
  champ.focus();

  ed.querySelector("[data-annuler]").addEventListener("click", () => {
    ed.remove();
    bloc.dataset.ouvert = "non";
  });
  garder.addEventListener("click", () => {
    panier.ajouter(r, champ.value);
    ed.remove();
    bloc.dataset.ouvert = "non";
  });
}

/* --- le panier --------------------------------------------------------------- */
function creerPanier(script) {
  const tout = lire(RANGEMENT_PANIER, {});
  const cle = `${script.zone}__${script.nom}`;
  const mien = tout[cle] || {};

  const compte = $("#panierCompte");
  const boite = $("#panier");

  function rafraichir() {
    const n = Object.keys(mien).length;
    compte.textContent = n;
    boite.dataset.plein = n ? "oui" : "non";
    tout[cle] = mien;
    ecrire(RANGEMENT_PANIER, tout);
  }

  return {
    get: (id) => mien[id],
    ajouter(r, propose) {
      mien[r.id] = { id: r.id, loc: r.loc, avant: r.brut_fr, propose };
      rafraichir();
    },
    vider() {
      for (const k of Object.keys(mien)) delete mien[k];
      rafraichir();
    },
    corps() {
      const lignes = Object.values(mien).map(
        (p) =>
          `### \`${p.id}\`${p.loc ? ` — ${p.loc}` : ""}\n\n` +
          `**Actuel**\n\`\`\`\n${p.avant}\n\`\`\`\n` +
          `**Proposé**\n\`\`\`\n${p.propose}\n\`\`\`\n`
      );
      return (
        `Relecture de \`${script.nom}\` (${ZONES[script.zone] || script.zone}).\n\n` +
        `Les ${lignes.length} proposition(s) ci-dessous ont été vérifiées dans l'outil de ` +
        `relecture : parité des jetons, largeur en pixels, et marge du bloc.\n\n` +
        lignes.join("\n")
      );
    },
    rafraichir,
  };
}

/* --- le fil ------------------------------------------------------------------ */
async function demarrer() {
  const cle = new URLSearchParams(location.search).get("s");
  const fil = $("#fil");
  if (!cle) {
    fil.innerHTML = `<p class="chargement">Aucun script demandé. <a href="index.html">Retour au sommaire</a>.</p>`;
    return;
  }

  let script, contraintes;
  try {
    [script, contraintes] = await Promise.all([
      fetch(`data/scripts/${encodeURIComponent(cle)}.json`).then((r) => r.json()),
      fetch("data/contraintes.json").then((r) => r.json()),
    ]);
  } catch {
    fil.innerHTML = `<p class="chargement">Ce script n'a pas pu être chargé.
      <a href="index.html">Retour au sommaire</a>.</p>`;
    return;
  }

  $("#nom").textContent = script.nom;
  $("#zone").textContent = ZONES[script.zone] || script.zone;
  document.title = `${script.nom} — Relecture Persona 1 FR`;

  const mesurer = mesureur(contraintes);
  const panier = creerPanier(script);
  panier.rafraichir();

  // Les repliques, groupees par bloc : un bloc est une scene.
  let caches = 0;
  let blocCourant = null;
  let locPrecedent = null;
  const morceaux = [];

  for (const r of script.repliques) {
    // Ni le japonais inutilise, ni les blocs de mise en scene : le jeu
    // n'affiche ni l'un ni l'autre, et un relecteur n'a rien a y faire.
    if (r.japonais || r.technique) { caches++; continue; }
    r.zone = script.zone;

    if (r.bloc !== blocCourant) {
      blocCourant = r.bloc;
      locPrecedent = null;
      morceaux.push(`<p class="scene">${echappe(r.bloc)}</p>`);
    }
    const suite = r.loc && r.loc === locPrecedent;
    locPrecedent = r.loc;

    morceaux.push(`<article class="replique" data-id="${echappe(r.id)}" data-suite="${suite ? "oui" : "non"}">
      ${portrait(r)}
      <p class="replique__qui">${echappe(r.loc || "—")}</p>
      <div class="replique__fr">${enHtml(r.fr)}</div>
      <div class="replique__en">${enHtml(r.en)}</div>
      <button class="corriger" type="button">Proposer</button>
    </article>`);
  }
  if (caches) {
    morceaux.push(`<p class="scene" style="opacity:.55">${caches} ligne(s) techniques masquées</p>`);
  }
  fil.innerHTML = morceaux.join("");

  const parId = new Map(script.repliques.map((r) => [r.id, r]));

  fil.addEventListener("click", (e) => {
    const b = e.target.closest(".corriger");
    if (!b) return;
    const art = b.closest(".replique");
    ouvrirEditeur(art, parId.get(art.dataset.id), contraintes, mesurer, panier);
  });

  /* --- la barre --------------------------------------------------------- */
  const bAnglais = $("#voirAnglais");
  bAnglais.addEventListener("click", () => {
    const on = document.body.dataset.anglais !== "oui";
    document.body.dataset.anglais = on ? "oui" : "non";
    bAnglais.setAttribute("aria-pressed", String(on));
  });

  const bLu = $("#marquerLu");
  const lus = new Set(lire(RANGEMENT_LUS, []));
  const majLu = () => bLu.setAttribute("aria-pressed", String(lus.has(cle)));
  majLu();
  bLu.addEventListener("click", () => {
    lus.has(cle) ? lus.delete(cle) : lus.add(cle);
    ecrire(RANGEMENT_LUS, [...lus]);
    majLu();
  });

  $("#vider").addEventListener("click", () => panier.vider());
  $("#envoyer").addEventListener("click", () => {
    const titre = `Relecture : ${script.nom}`;
    const url =
      `${DEPOT}/issues/new?title=${encodeURIComponent(titre)}` +
      `&body=${encodeURIComponent(panier.corps())}`;
    // Une issue GitHub a une limite de longueur dans l'URL : au-dela, on copie.
    if (url.length > 7000) {
      navigator.clipboard?.writeText(panier.corps());
      alert(
        "Trop de propositions pour tenir dans un lien.\n\n" +
          "Elles ont été copiées dans le presse-papiers : ouvrez une issue sur le dépôt et collez."
      );
      window.open(`${DEPOT}/issues/new`, "_blank", "noopener");
      return;
    }
    window.open(url, "_blank", "noopener");
  });

  jetons(""); // garde l'import utilise si l'editeur n'est jamais ouvert
}

demarrer();
