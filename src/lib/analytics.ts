// Google Analytics 4: the ONLY place the measurement ID lives. Base.astro
// renders the gtag snippet from it on every page (production builds only, and
// never on localhost, so dev, preview and QA sessions don't show up in the
// stats). The ID is public by design: it is visible in every page's source.
export const GA_MEASUREMENT_ID = 'G-2ZMKKYTYS8';
