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
      { label: 'Collections', href: '/collections', also: '/collection/', icon: 'shelf', desc: 'Filmographies and franchises' },
      { label: 'Directors', href: '/directors', also: '/director/', icon: 'chair', desc: 'Shot length, director by director' },
    ],
  },
  {
    id: 'yours',
    label: 'Yours',
    icon: 'star',
    items: [{ label: 'Your ratings', href: '/your-ratings', icon: 'star', desc: 'Your scores, kept in this browser' }],
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
  if (clean === '/' || !clean) return false;
  const root = base.replace(/\/$/, '');
  const p = path.replace(/\/$/, '');
  const target = root + clean;
  return p === target || p.startsWith(`${target}/`) || (item.also != null && p.startsWith(root + item.also));
}
