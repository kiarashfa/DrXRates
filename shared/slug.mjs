// Movie URL slugs. Imported by the data build (which writes movie.slug) and
// by client code, which rebuilds slugs from title/year/id instead of
// downloading them. Changing this changes every movie URL.

export function slugify(s) {
  const slug = String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'film';
}

export function movieSlug(title, year, id) {
  return `${slugify(title)}-${year ?? 'tba'}-${id}`;
}
