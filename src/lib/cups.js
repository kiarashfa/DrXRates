// Build-time access to the published Dr. X's Cup brackets in data/cups/*.json
// (format in knockout.js). An invalid file fails the build; entrants still in
// the archive gain a `slug` so their cards link to the film page.
import { cupProblems } from './knockout.js';
import { movieById } from './data.js';

const files = import.meta.glob('../../data/cups/*.json', { eager: true, import: 'default' });

export const CUPS = Object.entries(files)
  .map(([path, cup]) => {
    const fileSlug = path.split('/').pop().replace(/\.json$/, '');
    const problems = cupProblems(cup, fileSlug);
    if (problems.length) throw new Error(`data/cups/${fileSlug}.json: ${problems.join('; ')}`);
    const entrants = cup.entrants.map((e) => {
      const m = movieById.get(e.id);
      return { ...e, slug: m?.slug ?? null };
    });
    return { ...cup, entrants };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
