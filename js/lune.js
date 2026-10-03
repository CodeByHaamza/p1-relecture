/* ============================================================================
   La lune, indicateur d'etat.

   P1 compte ses jours en phases de lune : c'est le seul cadran qui ait du sens
   dans ce jeu. Nouvelle = jamais ouvert, pleine = relu.

   Deux dessins fixes plutot qu'un `clipPath` calcule : un clip par carte
   fabriquait un identifiant par etat, donc des identifiants repetes dans la
   page des que deux scripts partageaient le meme — du HTML invalide pour un
   resultat identique.
   ========================================================================= */

export const LUNES = {
  neuve: `<svg class="lune" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.6"/>
  </svg>`,

  croissante: `<svg class="lune" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.6"/>
    <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5 Z" fill="currentColor"/>
  </svg>`,

  pleine: `<svg class="lune" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="currentColor"/>
  </svg>`,
};

export function lune(etat) {
  return LUNES[etat] || LUNES.neuve;
}
