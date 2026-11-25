# Third-party material

Dr. X Rates includes or relies on the third-party material listed here. Each item stays under its own license, and the KFA Source-Available License does not apply to it.

## Required notices

- This product uses the TMDB API but is not endorsed or certified by TMDB.

The sentence appears with the TMDB logo in the footer of every page and on the About page, which also credits the data sources.

## Software

| Name | Used for | License |
| --- | --- | --- |
| [Astro](https://astro.build) | Static site framework | MIT |
| [Svelte](https://svelte.dev) | Interactive components (rating panel, catalog, games, profile) | MIT |

## Fonts

| Font | License | Source |
| --- | --- | --- |
| EB Garamond (variable) | SIL Open Font License 1.1 | Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12). Self-hosted through [@fontsource-variable/eb-garamond](https://fontsource.org/fonts/eb-garamond) |
| Inter (variable) | SIL Open Font License 1.1 | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter). Self-hosted through [@fontsource-variable/inter](https://fontsource.org/fonts/inter) |
| JetBrains Mono (variable) | SIL Open Font License 1.1 | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono). Self-hosted through [@fontsource-variable/jetbrains-mono](https://fontsource.org/fonts/jetbrains-mono) |
| Limelight (Name the Frame page) | SIL Open Font License 1.1 | Copyright (c) 2010 by Sorkin Type Co (eben@eyebytes.com) with Reserved Font Name Limelight. Self-hosted through [@fontsource/limelight](https://fontsource.org/fonts/limelight) |

Copies of EB Garamond and Inter (`scripts/brand/fonts/`, with their licenses in `FONT-LICENSES.txt`) are used only to draw the social preview image and are not served by the site.

## Data and services

| Name | Used for | Terms |
| --- | --- | --- |
| [TMDB](https://www.themoviedb.org/) | Film metadata (titles, years, runtimes, genres, overviews, taglines, cast and crew), posters, backdrops, cast and director photos, and community scores. Data is fetched at build time and images are loaded from TMDB's image servers | [TMDB API terms of use](https://www.themoviedb.org/api-terms-of-use) |
| [OMDb API](https://www.omdbapi.com/) | IMDb, Rotten Tomatoes and Metacritic scores, and 9 fallback posters for films without TMDB artwork | [omdbapi.com](https://www.omdbapi.com/) |
| [Wikipedia](https://en.wikipedia.org/) and [Wikimedia Commons](https://commons.wikimedia.org/) | Biography text and portraits for 7 director pages that TMDB cannot supply (see Media) | [Wikipedia copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights) |
| [Cinemetrics](https://cinemetrics.uchicago.edu/) | Average shot length figures (1,410 films), compiled by hand, largely from Cinemetrics-style measurement, as the About page says | Figures compiled by the site's author; see the About page |
| [Google Analytics](https://www.googletagmanager.com/) (gtag.js) | Visit statistics, loaded on every page | [Google Terms of Service](https://policies.google.com/terms) |
| Google Drive API and Google Identity Services | Optional cloud save of the visitor's own data to the visitor's own Google Drive (app-data folder only) | [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) |
| [Dropbox API](https://www.dropbox.com/) | Optional cloud save of the visitor's own data to the visitor's own Dropbox | Dropbox terms |

## Media

**Posters, backdrops and people photos, from TMDB.** 21,175 films, almost all with TMDB artwork (21,074 posters and 20,848 backdrops), plus cast and director photos. The data files store only TMDB image paths, and the images are loaded from TMDB's image servers. They belong to their respective rights holders and are provided through the TMDB API.

**Fallback posters, from OMDb.** 9 films with no TMDB artwork use the poster URL returned by OMDb.

**Director portraits, from Wikimedia Commons.** For 7 director pages the portrait and the biography text come from Wikipedia, because TMDB has no match for these entries. The author and license of each photograph, as shown on its Commons file page:

| Director page | Commons file | License and author |
| --- | --- | --- |
| Bennett Miller | [Bennett_Altman_Miller.jpg](https://commons.wikimedia.org/wiki/File:Bennett_Altman_Miller.jpg) | Quitednorthern, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Claire Denis | [Claire_Denis_at_Berlinale_2022_Ausschnitt.jpg](https://commons.wikimedia.org/wiki/File:Claire_Denis_at_Berlinale_2022_Ausschnitt.jpg) | Elena Ternovaja, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Coen Brothers | [Coen_brothers_Cannes_2015_2_(CROPPED).jpg](https://commons.wikimedia.org/wiki/File:Coen_brothers_Cannes_2015_2_%28CROPPED%29.jpg) | Georges Biard, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Dardenne Brothers | [Dardenne_Lumières_2015.jpg](https://commons.wikimedia.org/wiki/File:Dardenne_Lumi%C3%A8res_2015.jpg) | Georges Biard, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Hughes Brothers | [HughesbrothersCCJuly09.jpg](https://commons.wikimedia.org/wiki/File:HughesbrothersCCJuly09.jpg) | Natasha Baucas (via [Flickr](https://www.flickr.com/photos/sdnatasha/)), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| Russo Brothers | [Joe_Russo_&_Anthony_Russo_by_Gage_Skidmore.jpg](https://commons.wikimedia.org/wiki/File:Joe_Russo_%26_Anthony_Russo_by_Gage_Skidmore.jpg) | Gage Skidmore, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| The Wachowskis | [Lana_Wachowski-2787_(3x4_cropped).jpg](https://commons.wikimedia.org/wiki/File:Lana_Wachowski-2787_%283x4_cropped%29.jpg) | Harald Krichel, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

**Film still frames.** 9,767 frames from 1,294 films, shown in the film galleries and in Name the Frame. They are served from the project's separate Dr. X Media site (`kiarashfa.github.io/DrXMedia/`), where they are selected for review and commentary. Film images, like the posters and backdrops above, belong to their respective rights holders and are not covered by the KFA license; the Appendix of the LICENSE file says so.

## License texts

<details>
<summary>SIL Open Font License 1.1</summary>

```
Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
Copyright (c) 2010 by Sorkin Type Co (eben@eyebytes.com) with Reserved Font Name Limelight

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

</details>

<details>
<summary>MIT License</summary>

```
MIT License

Astro: Copyright (c) 2021 Fred K. Schott; parts Copyright (c) 2020 sveltejs/kit contributors; parts Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors
Svelte: Copyright (c) 2016-2025 Svelte Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>
