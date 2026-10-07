/* ============================================================================
   La lecture d'un script, et l'editeur qui va avec.

   Parti pris : on lit d'abord, on corrige ensuite. Le francais tient la
   colonne, l'anglais ne se montre qu'a la demande — un relecteur qui lit deux
   colonnes en parallele ne lit ni l'une ni l'autre.
   ========================================================================= */

import { verifier, mesureur, jetons } from "./mesure.js";
import { enHtml, echappe } from "./rendu.js";
import { chargerEtat, lienPrendre } from "./etat.js";

const RANGEMENT_LUS = "p1fr-relecture-lus";
const RANGEMENT_PANIER = "p1fr-relecture-panier";
// Ou on en etait, script par script. Un script fait une centaine de repliques :
// on le quitte et on y revient, c'est la regle, pas l'exception.
const RANGEMENT_PLACE = "p1fr-relecture-place";
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

/** Une teinte stable pour un nom. Jusqu'a 21 locuteurs par script : un anneau
 *  de couleur se reconnait avant qu'on ait lu le nom, et c'est ce qui permet de
 *  survoler un fil. La teinte vient du nom lui-meme, donc elle ne change jamais
 *  d'un script a l'autre — et elle reste dans la moitie froide-violette du
 *  cercle, pour ne pas se battre avec l'or de la page.
 */
function teinte(nom) {
  let h = 0;
  for (const c of nom || "?") h = (h * 31 + c.codePointAt(0)) % 360;
  return 200 + (h % 160); // de 200 a 360 : bleus, violets, magentas
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
      <div class="jauge" data-jauge="slot" hidden>
        <div class="jauge__titre"><span>Slot</span><span class="jauge__valeur">—</span></div>
        <div class="jauge__barre"><div class="jauge__remplie"></div></div>
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

    // Le slot passe devant la largeur : c'est la contrainte la plus dure, et
    // la seule qui tronque sans rien dire. Masquee quand l'entree n'en a pas.
    const js = ed.querySelector('[data-jauge="slot"]');
    js.hidden = !v.slot.connu;
    if (v.slot.connu) {
      js.dataset.etat = v.slot.etat;
      js.querySelector(".jauge__valeur").textContent = v.slot.texte;
      js.querySelector(".jauge__remplie").style.width =
        `${Math.min(100, (v.slot.signes / v.slot.max) * 100)}%`;
    }

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
      !v.jetons.ok ||
      (v.slot.connu && v.slot.etat === "deborde") ||
      v.largeur.etat === "deborde" ||
      (v.bloc.connu && v.bloc.etat === "deborde");
    garder.disabled = bloquant || champ.value.trim() === r.brut_fr.trim();
    note.textContent = bloquant
      ? !v.jetons.ok
        ? "Les codes du jeu doivent rester les mêmes, dans le même ordre."
        : v.slot.connu && v.slot.etat === "deborde"
          ? `Cette entrée tient dans ${v.slot.max} signes : le jeu tronque le reste sans rien dire.`
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

  const texte = $("#panierTexte");
  const boite = $("#panier");

  function rafraichir() {
    const n = Object.keys(mien).length;
    boite.dataset.plein = n ? "oui" : "non";
    texte.innerHTML = n ? `<b>${n}</b> proposition(s)` : "Lu en entier&nbsp;?";
    const envoyer = document.getElementById("envoyer");
    envoyer.textContent = n ? "Envoyer" : "Signaler relu";
    envoyer.title = n
      ? "Ouvrir une issue avec vos propositions"
      : "Dire au projet que ce script est lu, et qu'il n'y a rien a corriger";
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
      // Une relecture sans correction est une relecture : c'est meme le cas le
      // plus utile a signaler, parce que c'est le seul que personne ne voit
      // passer. Sans ce message, un script impeccable resterait « a lire »
      // pour toujours.
      if (!Object.keys(mien).length) {
        return (
          `Relecture de \`${script.nom}\` (${ZONES[script.zone] || script.zone}) : ` +
          `lu en entier, rien à signaler.\n\n` +
          `Les ${script.repliques.length} répliques du script ont été parcourues dans ` +
          `l'outil de relecture. Aucune proposition de modification.\n`
        );
      }
      const lignes = Object.values(mien).map(
        (p) =>
          `### \`${p.id}\`${p.loc ? ` — ${p.loc}` : ""}\n\n` +
          `**Actuel**\n\`\`\`\n${p.avant}\n\`\`\`\n` +
          `**Proposé**\n\`\`\`\n${p.propose}\n\`\`\`\n`
      );
      return (
        `Relecture de \`${script.nom}\` (${ZONES[script.zone] || script.zone}).\n\n` +
        `Les ${lignes.length} proposition(s) ci-dessous ont été vérifiées dans l'outil de ` +
        `relecture : parité des jetons, **taille du slot**, largeur en pixels, et marge ` +
        `du bloc.\n\n` +
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

  let script, contraintes, index;
  try {
    [script, contraintes, index] = await Promise.all([
      fetch(`data/scripts/${encodeURIComponent(cle)}.json`).then((r) => r.json()),
      fetch("data/contraintes.json").then((r) => r.json()),
      // Le sommaire, pour enchainer les scripts sans y retourner : 284 fois
      // l'aller-retour, c'est 284 occasions de s'arreter.
      fetch("data/index.json").then((r) => r.json()),
    ]);
  } catch {
    fil.innerHTML = `<p class="chargement">Ce script n'a pas pu être chargé.
      <a href="index.html">Retour au sommaire</a>.</p>`;
    return;
  }

  // Quelqu'un s'en occupe-t-il deja ? Le dire AVANT la lecture, pas apres :
  // apres, le temps est deja perdu. L'etat sert aussi, plus bas, a designer le
  // prochain script que personne n'a pris.
  let etat = {};
  try {
    etat = await chargerEtat(index);
    const fiche = etat[cle];
    if (fiche && fiche.issues && fiche.issues.length) {
      const d = fiche.issues[fiche.issues.length - 1];
      const bandeau = document.createElement("p");
      bandeau.className = "deja";
      bandeau.dataset.etat = fiche.relu ? "relu" : "cours";
      bandeau.innerHTML = fiche.relu
        ? `Ce script a déjà été relu (<a href="${d.url}" target="_blank" rel="noopener">#${d.numero}</a>,
           ${echappe(d.qui)}, ${echappe(d.le)}). Une seconde paire d'yeux reste utile.`
        : `<b>${echappe(d.qui)}</b> est en train de le relire
           (<a href="${d.url}" target="_blank" rel="noopener">#${d.numero}</a>).
           Mieux vaut en choisir un autre, ou lui écrire.`;
      fil.before(bandeau);
    }
  } catch {
    /* pas d'etat publie : on lit sans. */
  }

  $("#nom").textContent = script.nom;
  $("#zone").textContent = ZONES[script.zone] || script.zone;
  document.title = `${script.nom} — Relecture Persona 1 FR`;

  const mesurer = mesureur(contraintes);
  const panier = creerPanier(script);
  panier.rafraichir();

  // Les repliques, groupees par bloc : un bloc est une scene.
  let caches = 0;
  let scene = 0;
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
      scene++;
      // Un bloc est une scene. Son nom technique (`E0.BIN:003`) ne dit rien a
      // un relecteur : on compte les scenes, et on garde l'identifiant a cote
      // en petit, pour celui qui doit en parler dans une issue.
      morceaux.push(
        `<p class="scene"><span>Scène ${scene}</span>` +
          `<code class="scene__bloc">${echappe(r.bloc)}</code></p>`
      );
    }
    const suite = r.loc && r.loc === locPrecedent;
    locPrecedent = r.loc;

    // `tabindex` : la replique est l'unite de lecture, donc l'unite de
    // deplacement. Sans cela le clavier ne saute que de bouton en bouton.
    morceaux.push(`<article class="replique" tabindex="-1"
      style="--teinte:${teinte(r.loc)}"
      data-id="${echappe(r.id)}" data-suite="${suite ? "oui" : "non"}">
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

  const ouvrir = (art) =>
    art && ouvrirEditeur(art, parId.get(art.dataset.id), contraintes, mesurer, panier);

  fil.addEventListener("click", (e) => {
    const b = e.target.closest(".corriger");
    if (!b) return;
    ouvrir(b.closest(".replique"));
  });

  /* --- le clavier -------------------------------------------------------- */
  // Relire trois cents repliques a la souris est epuisant : on vise, on clique,
  // on revient. Au clavier la main ne quitte pas la position de lecture.
  const toutes = [...fil.querySelectorAll(".replique")];
  let ici = -1;

  function allerA(i, doux = true) {
    if (!toutes.length) return;
    ici = Math.max(0, Math.min(toutes.length - 1, i));
    for (const a of toutes) a.removeAttribute("data-ici");
    const art = toutes[ici];
    art.dataset.ici = "oui";
    art.scrollIntoView({ block: "center", behavior: doux ? "smooth" : "auto" });
    art.focus({ preventScroll: true });
    noterPlace(ici);
    majAvancee();
  }

  // Cliquer, c'est aussi dire « je suis ici » : le clavier reprend la ou la
  // souris s'est arretee, au lieu de renvoyer en haut du fil.
  fil.addEventListener("mousedown", (e) => {
    const art = e.target.closest(".replique");
    if (!art) return;
    ici = toutes.indexOf(art);
    for (const a of toutes) a.removeAttribute("data-ici");
    art.dataset.ici = "oui";
  });

  document.addEventListener("keydown", (e) => {
    // Dans un champ, les lettres sont du texte. Sur un bouton ou un lien,
    // Entree les active — ce n'est pas a nous de l'intercepter.
    const dansUnChamp = e.target.matches("input, textarea, button, a, select");
    if (e.key === "Escape") {
      const ed = document.querySelector(".editeur");
      if (ed) {
        const art = ed.closest(".replique");
        ed.remove();
        art.dataset.ouvert = "non";
        art.focus({ preventScroll: true });
        e.preventDefault();
      }
      return;
    }
    if (dansUnChamp || e.ctrlKey || e.metaKey || e.altKey) return;

    const bas = e.key === "j" || e.key === "J" || e.key === "ArrowDown";
    const haut = e.key === "k" || e.key === "K" || e.key === "ArrowUp";
    if (bas || haut) {
      allerA(ici < 0 ? (bas ? 0 : toutes.length - 1) : ici + (bas ? 1 : -1));
      e.preventDefault();
    } else if (e.key === "e" || e.key === "E" || e.key === "Enter") {
      if (ici < 0) allerA(0);
      ouvrir(toutes[ici]);
      e.preventDefault();
    } else if (e.key === "a" || e.key === "A") {
      bAnglais.click();
      e.preventDefault();
    } else if (e.key === "c" || e.key === "C") {
      bCodes.click();
      e.preventDefault();
    } else if (e.key === "[" || e.key === "]") {
      // Une scene est un bloc : s'y deplacer, c'est se deplacer dans le recit
      // plutot que ligne a ligne.
      const scenes = [...fil.querySelectorAll(".scene")];
      const y = window.scrollY + 90;
      const avant = scenes.filter((s) => s.offsetTop < y - 10);
      const cible = e.key === "]" ? scenes.find((s) => s.offsetTop > y + 10) : avant[avant.length - 1];
      if (cible) cible.scrollIntoView({ block: "start", behavior: "smooth" });
      e.preventDefault();
    } else if (e.key === "n" || e.key === "N") {
      const a = pied.querySelector(".bouton--fort") || pied.querySelector(".bouton:last-child");
      if (a) location.href = a.href;
      e.preventDefault();
    } else if (e.key === "p" || e.key === "P") {
      if (rang > 0) location.href = lien(rang - 1);
      e.preventDefault();
    }
  });

  /* --- enchainer les scripts -------------------------------------------- */
  // Le sommaire est un detour : 284 scripts, c'est 284 occasions de s'arreter.
  // D'ou le pied du fil, et N / P au clavier.
  const ordre = [...index].sort((a, b) =>
    a.zone === b.zone ? a.nom.localeCompare(b.nom) : a.zone.localeCompare(b.zone)
  );
  const rang = ordre.findIndex((x) => `${x.zone}__${x.nom}` === cle);
  const lien = (i) => `lecture.html?s=${encodeURIComponent(`${ordre[i].zone}__${ordre[i].nom}`)}`;

  // Le prochain que personne n'a pris : ni relu, ni en cours. C'est celui-la
  // qu'il faut proposer, pas simplement le suivant dans l'ordre alphabetique.
  const mesLus = new Set(lire(RANGEMENT_LUS, []));
  const libre = (x) => {
    const k = `${x.zone}__${x.nom}`;
    const f = etat[k];
    return k !== cle && !(f && (f.relu || f.en_cours)) && !mesLus.has(k);
  };
  const apres = ordre.slice(rang + 1).findIndex(libre);
  const iLibre = apres >= 0 ? rang + 1 + apres : ordre.findIndex(libre);

  const bouts = [];
  if (rang > 0) bouts.push(`<a class="bouton" href="${lien(rang - 1)}">← ${echappe(ordre[rang - 1].nom)}</a>`);
  if (iLibre >= 0) {
    bouts.push(
      `<a class="bouton bouton--fort" href="${lien(iLibre)}">` +
        `Prochain à relire : ${echappe(ordre[iLibre].nom)} →</a>`
    );
  }
  if (rang >= 0 && rang < ordre.length - 1) {
    bouts.push(`<a class="bouton" href="${lien(rang + 1)}">${echappe(ordre[rang + 1].nom)} →</a>`);
  }
  const pied = document.createElement("nav");
  pied.className = "suite";
  pied.setAttribute("aria-label", "Passer à un autre script");
  pied.innerHTML =
    `<p class="suite__dit">Fin de <b>${echappe(script.nom)}</b>. ` +
    `${rang + 1}<sup>e</sup> script sur ${ordre.length}.</p>` +
    `<div class="suite__liens">${bouts.join("")}</div>`;
  fil.after(pied);

  /* --- reprendre ou on en etait ----------------------------------------- */
  // Une centaine de repliques par script : on le quitte et on y revient. Mais
  // on ne saute pas d'autorite — on propose, et c'est le lecteur qui decide.
  const places = lire(RANGEMENT_PLACE, {});
  function noterPlace(i) {
    if (i <= 0) delete places[cle];
    else places[cle] = i;
    ecrire(RANGEMENT_PLACE, places);
  }
  const reprise = places[cle];
  if (reprise > 0 && reprise < toutes.length) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "reprendre";
    b.textContent = `Reprendre à la réplique ${reprise + 1} sur ${toutes.length}`;
    b.addEventListener("click", () => {
      allerA(reprise, false);
      b.remove();
    });
    fil.before(b);
  }

  /* --- la hauteur de la barre, mesuree ---------------------------------- */
  // La barre du haut et les en-tetes de scene sont tous deux collants. Sans
  // connaitre la hauteur REELLE de la barre — qui change quand ses boutons
  // passent a la ligne —, la scene se glisse dessous et devient illisible.
  const barre = document.querySelector(".barre");
  const mesurerBarre = () =>
    document.documentElement.style.setProperty("--haut-barre", `${barre.offsetHeight}px`);
  mesurerBarre();
  if (window.ResizeObserver) new ResizeObserver(mesurerBarre).observe(barre);
  else addEventListener("resize", mesurerBarre);

  /* --- l'avancee dans le script ----------------------------------------- */
  // Un script de trois cents repliques sans repere, c'est un puits : on ne sait
  // ni ou on en est ni combien il reste.
  const jauge = $("#avancee");
  let attente = 0;
  function majAvancee() {
    const h = document.documentElement;
    const course = h.scrollHeight - h.clientHeight;
    const part = course > 0 ? (h.scrollTop / course) * 100 : 100;
    jauge.style.width = `${Math.max(0, Math.min(100, part))}%`;
  }
  addEventListener("scroll", () => {
    // Un seul calcul par image : la barre n'a pas besoin d'etre recalculee
    // trois fois entre deux rendus.
    if (attente) return;
    attente = requestAnimationFrame(() => {
      attente = 0;
      majAvancee();
    });
  }, { passive: true });
  majAvancee();

  /* --- la barre --------------------------------------------------------- */
  // Deux bascules de confort, et elles se gardent d'une page a l'autre : on
  // relit cent scripts, pas un, et recocher « anglais » cent fois est une
  // friction qu'on remarque.
  function bascule(bouton, champ, cleRangement) {
    const poser = (on) => {
      document.body.dataset[champ] = on ? "oui" : "non";
      bouton.setAttribute("aria-pressed", String(on));
      ecrire(cleRangement, on);
    };
    poser(lire(cleRangement, false) === true);
    bouton.addEventListener("click", () => poser(document.body.dataset[champ] !== "oui"));
  }

  const bAnglais = $("#voirAnglais");
  const bCodes = $("#voirCodes");
  bascule(bAnglais, "anglais", "p1fr-relecture-anglais");
  bascule(bCodes, "codes", "p1fr-relecture-codes");

  // Trois crans de taille, memorises. Pas un reglage continu : trois choix
  // nets valent mieux qu'un curseur dont on ne retrouve jamais le bon point.
  const CRANS = ["petit", "moyen", "grand"];
  const bTaille = $("#taille");
  function poserTaille(v) {
    document.body.dataset.taille = v;
    bTaille.textContent = `A ${CRANS.indexOf(v) + 1}/3`;
    bTaille.title = `Taille du texte : ${v}. Cliquer pour changer.`;
    ecrire("p1fr-relecture-taille", v);
  }
  poserTaille(CRANS.includes(lire("p1fr-relecture-taille", "")) ? lire("p1fr-relecture-taille", "") : "moyen");
  bTaille.addEventListener("click", () => {
    poserTaille(CRANS[(CRANS.indexOf(document.body.dataset.taille) + 1) % CRANS.length]);
  });

  // « Je prends ce script ». Sans lui, le suivi ne demarrait qu'a l'ENVOI des
  // propositions : entre l'ouverture d'un script et l'envoi, personne ne voyait
  // que quelqu'un etait dessus, et deux personnes pouvaient lire la meme chose
  // toute une soiree. L'issue ouverte tout de suite, meme vide, c'est ce qui
  // reserve — et `etat.js` la voit dans la seconde, pas au lendemain.
  const bPrendre = $("#prendre");
  const fichePrise = etat[cle];
  if (fichePrise && (fichePrise.relu || fichePrise.en_cours)) {
    // Deja pris ou deja relu : on n'invite plus a le prendre. Le bandeau
    // au-dessus du fil dit qui et ou en est.
    bPrendre.hidden = true;
  } else {
    bPrendre.addEventListener("click", () => {
      window.open(lienPrendre(script.nom, ZONES[script.zone] || script.zone), "_blank", "noopener");
    });
  }

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
