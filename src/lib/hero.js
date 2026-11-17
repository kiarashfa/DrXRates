// Homepage hero: Hitchcock as Morpheus, the red pill (form) in one hand and the
// blue pill (content) in the other. Each picture in public/hero/ is a cut-out
// figure (<k>-fig.webp, and a 720px copy for phones), its depth map
// (<k>-depth.webp: background 0, nearest 1) and the smoke behind it with the
// figure removed (<k>-smoke.webp). Pill positions are % of the picture plus
// the pill's depth, so the page can place things on a pill as the view moves.
// To show the other picture, change HERO_PICTURE and rebuild.
export const HERO_PICTURE = 'a';

export const HERO_PICTURES = {
  // Long leather coat, symmetric pose, smoke behind.
  a: { w: 1309, h: 1202, form: [21.2, 81.24, 0.76], content: [79.16, 81.88, 0.75] },
  // Split: a director's suit on the red pill's side, the oracle's coat and lens on the blue.
  b: { w: 1310, h: 1201, form: [22.74, 80.52, 0.75], content: [79.05, 80.68, 0.7] },
};
