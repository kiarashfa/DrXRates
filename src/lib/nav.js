// Site navigation: the one list behind the desktop header menus, the phone
// tab bar and its sheets, the footer and the "pages" part of search. A group
// with a single entry renders as a plain link. Paths are unprefixed; render
// them through withBase. `icon` names a symbol in SiteHeader.astro.
export const NAV = [
  { id: 'archive', label: 'Archive', href: '/#catalog', icon: 'archive', desc: 'Browse, filter and sort every film' },
  {
    id: 'explore',
    label: 'Explore',
    icon: 'explore',
    items: [
      { label: 'Dr. X Net', href: '/net', icon: 'net', desc: 'Films and the people who made them, connected' },
      { label: 'Insights', href: '/insights', icon: 'chart', desc: "Dr. X's ratings in numbers" },
      { label: 'Collections', href: '/collections', also: '/collection/', icon: 'shelf', desc: 'Filmographies and franchises' },
      { label: 'Directors', href: '/directors', also: '/director/', icon: 'chair', desc: 'Shot length, director by director', footer: false },
    ],
  },
  {
    id: 'play',
    label: 'Play',
    icon: 'dice',
    items: [
      { label: 'Name the Frame', href: '/name-the-frame', icon: 'stills', desc: "Name the film from one of Dr. X's frames", footer: false },
      { label: 'Knockout', href: '/knockout', also: '/knockout/', icon: 'trophy', desc: "Head-to-head brackets and Dr. X's Cup", footer: false },
      { label: 'Tonight', href: '/tonight', icon: 'dice', desc: 'Let the ledger pick a film for tonight', footer: false },
      { label: 'Compare', href: '/compare', icon: 'compare', desc: 'Two films side by side', footer: false },
    ],
  },
  {
    id: 'yours',
    label: 'Yours',
    icon: 'star',
    items: [
      { label: 'Your ratings', href: '/your-ratings', icon: 'star', desc: 'Your scores, kept in this browser', footer: false },
      { label: 'Watchlist', href: '/watchlist', icon: 'bookmark', desc: 'Films you mean to see', footer: false },
      { label: 'Taste match', href: '/your-ratings#taste-match', icon: 'match', desc: "Your scores against Dr. X's" },
    ],
  },
  { id: 'about', label: 'About', href: '/about', icon: 'info', desc: 'The ten-part system and the data' },
];

// Groups of one collapse to their entry (keeping the group's id).
export const NAV_ENTRIES = NAV.map((n) => (n.items?.length === 1 ? { ...n.items[0], id: n.id } : n));

// Every page link, flattened (footer, search).
export const NAV_LINKS = NAV.flatMap((n) => n.items ?? [n]);

// Whether `item` is the page at `path` (prefixed, from Astro.url), or one of
// its detail pages (`also`, e.g. /collection/<slug> under Collections).
export function isCurrent(item, path, base) {
  const clean = item.href.split('#')[0];
  // An anchor into a page (Taste match on Your ratings) never marks the page itself.
  if (clean === '/' || !clean || item.href.includes('#')) return false;
  const root = base.replace(/\/$/, '');
  const p = path.replace(/\/$/, '');
  const target = root + clean;
  return p === target || p.startsWith(`${target}/`) || (item.also != null && p.startsWith(root + item.also));
}
