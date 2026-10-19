// People and credits for the person-aware features (search, compare, graph).
// Built from the credits TMDB appends to every cached /movie/{id} answer, so
// they cost no extra API calls and work in --excel-only mode.

// Role codes used in credits.json. Writers belong to the content side of the
// rating system; the four crew roles after them each pair with a form
// criterion (cinematography, sound, directing & editing, design).
export const ROLES = {
  d: 'Director',
  a: 'Cast',
  w: 'Writer',
  c: 'Cinematographer',
  m: 'Composer',
  e: 'Editor',
  p: 'Production designer',
};

const CAST_LIMIT = 12; // same top-billed slice as movie.cast
const CREW_ROLE = {
  Director: 'd',
  Screenplay: 'w',
  Writer: 'w',
  Story: 'w',
  'Director of Photography': 'c',
  'Original Music Composer': 'm',
  Editor: 'e',
  'Production Design': 'p',
};

// One film's credits: { roles: { [code]: [personId, …] }, people: [{ id, name, profile }] }.
// Ids keep TMDB billing / crew order; a person appears once per role.
export function filmCredits(credits) {
  const byRole = {};
  const people = [];
  const add = (code, p) => {
    const list = (byRole[code] ??= []);
    if (list.includes(p.id)) return;
    list.push(p.id);
    people.push({ id: p.id, name: p.name, profile: p.profile_path ?? null });
  };
  for (const c of (credits?.cast ?? []).slice(0, CAST_LIMIT)) add('a', c);
  for (const c of credits?.crew ?? []) {
    const code = CREW_ROLE[c.job];
    if (code) add(code, c);
  }
  // Emit roles in ROLES order so the output doesn't depend on TMDB's crew order.
  const roles = {};
  for (const code of Object.keys(ROLES)) if (byRole[code]) roles[code] = byRole[code];
  return { roles, people };
}

// Merges per-film credits into the two committed files. Films are walked in
// id order so the output is identical on every run: a person's name comes
// from the first film that lists them, the profile photo from the first film
// that has one.
export function buildPeople(creditsByMovie) {
  const films = {};
  const people = new Map();
  for (const id of [...creditsByMovie.keys()].sort((a, b) => a - b)) {
    const { roles, people: seen } = creditsByMovie.get(id);
    films[id] = roles;
    for (const p of seen) {
      const known = people.get(p.id);
      if (!known) people.set(p.id, [p.name, p.profile]);
      else if (!known[1] && p.profile) known[1] = p.profile;
    }
  }
  const peopleObj = {};
  for (const pid of [...people.keys()].sort((a, b) => a - b)) peopleObj[pid] = people.get(pid);
  return { credits: { roles: ROLES, films }, people: peopleObj };
}
