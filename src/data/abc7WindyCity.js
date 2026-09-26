// ABC7 Chicago "Windy City Weekend" feature, aired Friday, September 25, 2026
// (gala day, before the Annual Gala at the MCA). Single source of truth: the
// /press hero, the homepage spotlight, the /links card and the /gala recap
// band all import from here.
//
// The ABC7 page embeds the FULL EPISODE (video 19871878, 23:33), not a clip.
// Our segment starts at 19:29 (1169 s) and runs to the end, about 4 minutes.
// Embed only through ABC7's official embed URL (never hotlink or self-host
// their mp4/HLS), and always link to the article and the video page.
//
// Start time: tested 2026-09-26 in the browser. `&t=1169`, `&start=1169` and
// `#t=1169` all play from 0:00 (after the preroll ad); ABC7's embed page only
// reads `pid`, `noAds`, `autoplay`, `isAmbient` and `source` from the query.
// So `embedUrl` stays plain and every surface shows the "starts at 19:29"
// hint instead. (`&autoplay=true` was tried too; it did not reliably start
// playback inside our iframe, so it is not used.)
//
// Guests: ABC7 spells the Junior Board President "Yaritza Jurado"; our site
// uses "Yari Jurado" (as on the Junior Board carousel), so we do too.

export const abc7Feature = {
  key: "abc7-windy-city",
  outlet: "ABC7 Chicago",
  show: "Windy City Weekend",
  hosts: "Val Warner and Ryan Chiaverini",
  airDateISO: "2026-09-25",
  dateLine: "September 25, 2026",
  dateLineEs: "25 de septiembre de 2026",
  byline: "ABC7 Chicago Digital Team · September 25, 2026",
  bylineEs: "Equipo Digital de ABC7 Chicago · 25 de septiembre de 2026",
  headline: "Latina Sweat Project joins ‘Windy City Weekend’",
  articleUrl:
    "https://abc7chicago.com/post/latina-sweat-project-joins-windy-city-weekend-find-more-redo-cabinets-south-walton-florida/19872532/",
  videoPageUrl: "https://abc7chicago.com/videoClip/19871878/",
  embedUrl: "https://abc7chicago.com/video/embed/?pid=19871878",
  episodeTitle: "Windy City Weekend - September 25, 2026",
  segmentStart: "19:29",
  segmentStartSeconds: 1169,
  segmentLength: "about 4 minutes",
  guests: [
    { name: "Yari Jurado", role: "Junior Board President", roleEs: "Presidenta de la Junior Board" },
    { name: "Savannah Alvarez", role: "Incoming Vice President", roleEs: "Próxima vicepresidenta" },
  ],
  logo: "/images/press/abc7-chicago.png",
  poster: "/images/gala/2026/recap/gala-recap-hero-1600.webp",
  eyebrow: "As seen on ABC7 Chicago · Windy City Weekend",
  eyebrowEs: "Visto en ABC7 Chicago · Windy City Weekend",
  blurb:
    "For Hispanic Heritage Month, Val Warner and Ryan Chiaverini welcomed Junior Board President Yari Jurado and incoming Vice President Savannah Alvarez on gala day. They talked about our three pillars, access, representation, and community, about losing our first studio and the search for the next one, and about what the night at the MCA would fund. Then everyone got on a mat: mountain pose, warrior two, and a reverse warrior, with the audience following along from their chairs.",
  blurbEs:
    "Por el Mes de la Herencia Hispana, Val Warner y Ryan Chiaverini recibieron a Yari Jurado, presidenta de la Junior Board, y a Savannah Alvarez, próxima vicepresidenta, el mismo día de la gala. Hablaron de nuestros tres pilares (acceso, representación y comunidad), de la pérdida de nuestro primer estudio y la búsqueda del próximo, y de lo que la noche en el MCA haría posible. Después, todos a la colchoneta: postura de la montaña, guerrero dos y guerrero invertido, con el público siguiendo desde sus sillas.",
  shortBlurb:
    "Yari and Savannah joined Val Warner and Ryan Chiaverini on gala day to talk access, representation, community, and the search for our next studio. Then the whole set got on a mat.",
  shortBlurbEs:
    "Yari y Savannah acompañaron a Val Warner y Ryan Chiaverini el día de la gala para hablar de acceso, representación, comunidad y la búsqueda de nuestro próximo estudio. Después, todo el set a la colchoneta.",
  hint: "The full episode plays here. Our segment starts at 19:29.",
  hintEs: "Aquí se reproduce el episodio completo. Nuestro segmento empieza en el minuto 19:29.",
  quote:
    "Since 2022, the Chicago-based wellness nonprofit has been serving low-income families and migrants and helped normalize yoga in Black and brown neighborhoods.",
  quoteAttribution: "ABC7 Chicago",
  chips: [
    { n: "01", en: "Hispanic Heritage Month", es: "Mes de la Herencia Hispana" },
    { n: "02", en: "Three pillars", es: "Tres pilares" },
    { n: "03", en: "The next studio", es: "El próximo estudio" },
    { n: "04", en: "Yoga on set", es: "Yoga en el set" },
  ],
  cta: {
    watchSegment: { en: "Watch the segment", es: "Ver el segmento" },
    readOnAbc7: { en: "Read on ABC7", es: "Leer en ABC7" },
    watchOnAbc7: { en: "Watch on ABC7", es: "Míralo en ABC7" },
  },
  colors: { blue: "#0058f0", ink: "#202030" },
};
