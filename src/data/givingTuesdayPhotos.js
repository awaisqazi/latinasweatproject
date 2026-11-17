// Photographs for /givingtuesday: the hero wall and the timeline.
//
// Rule (owner's note, Nov 17 2026): newest first. Every photo on the hero
// wall and in the 2026 chapter is from 2026: the site's own 2026 galleries,
// plus two studio class frames from LSP's team Drive dated May 2026 by their
// folder name. An older photo may appear only inside the chapter for its own
// year, and only when its date is established (site, or a Drive folder name):
// the 2025 chapter has one teacher training photo; 2022 to 2024 have none.
// Nobody is named; alt texts describe the scene only.
//
// Two kinds of source, so swapping a photo is a one-line change:
//   local("wall/<name>")      a crop made by scripts/prepare-givingtuesday-photos.mjs
//                             (wall: <name>-360/720.webp, 4:3; story:
//                             <name>-800/big.webp, full frame)
//   flickr(stem, hStem)       a photo in LSP's Flickr albums, served from the
//                             Flickr CDN exactly as /sweatfest and /gala do.
//                             stem = the base stem without size suffix (it
//                             serves _w 400, _c 800 and _b 1024); hStem = the
//                             album's stored _h 1600 stem, kept for reference
//                             only: _h URLs did not load from this page in the
//                             Nov 17 2026 check, so the page stops at _b.
//
// Galleries used (event, date, where the site says so):
//   ribbon cutting at Mural Park, Sun Nov 15 2026 (src/data/ribbonCutting.js:1-2)
//   Día de los Muertos at La Villita Park, Oct 31 2026 (src/data/ddlmRecap2026.js:52;
//     the Flickr frames were all shot Saturday Oct 31: src/data/ddlmGallery2026.js:6-7)
//   Annual Gala 2026, Sep 25 2026, MCA Chicago (src/data/galaRecap2026.js:23;
//     colour album src/data/galaGallery2026.js)
//   Sweat Fest, Aug 22 2026, 18th & Peoria (src/data/sweatFest.js:15,21;
//     album src/data/sweatFestGallery.js)
//   YTT graduation, Fri Aug 7 2026 (src/pages/graduation.astro:8,55)
//   LSP team Drive picks (marketing/giving-tuesday-2026/drive-photos/picks.json):
//     team bonding class, May 2026 (folder "[PHOTO] Team Bonding May 26'");
//     teacher training 2025 (folder "[VIDEO] 2025 LSP TT")

const FLICKR = "https://live.staticflickr.com/";

export const local = (path) => ({ kind: "local", path });
export const flickr = (stem, hStem) => ({ kind: "flickr", stem, hStem });

// { src, srcset } for a wall tile (4:3) or the hero's one photo.
export function wallImage(p, base, { one = false } = {}) {
  if (p.kind === "flickr") {
    const a = `${FLICKR}${p.stem}_w.jpg`;
    const c = `${FLICKR}${p.stem}_c.jpg`;
    if (one) return { src: c, srcset: `${c} 800w, ${FLICKR}${p.stem}_b.jpg 1024w` };
    return { src: a, srcset: `${a} 400w, ${c} 800w` };
  }
  const root = `${base}images/givingtuesday/${p.path}`;
  if (one) return { src: `${root}-960.webp`, srcset: `${root}-480.webp 480w, ${root}-960.webp 960w` };
  return { src: `${root}-360.webp`, srcset: `${root}-360.webp 360w, ${root}-720.webp 720w` };
}

// { src, srcset } for a full-frame timeline photo.
export function storyImage(p, base) {
  if (p.kind === "flickr") {
    const c = `${FLICKR}${p.stem}_c.jpg`;
    return { src: c, srcset: `${c} 800w, ${FLICKR}${p.stem}_b.jpg 1024w` };
  }
  const root = `${base}images/givingtuesday/${p.path}`;
  return { src: `${root}-800.webp`, srcset: `${root}-800.webp 800w, ${root}-big.webp 1400w` };
}

// The hero's ONE photo ("From one class"): a full class in session in the
// studio, May 2026. From LSP's team Drive, folder "[PHOTO] Team Bonding
// May 26'" (the date comes from the folder name; see
// marketing/giving-tuesday-2026/drive-photos/picks.json). Cropped by the
// prepare script to wall/one-{480,960}.webp.
export const heroOne = {
  photo: local("wall/one"),
  w: 960,
  h: 720,
  alt: "A full class in a bright studio, everyone reaching up and back in the same pose.",
  event: "Team bonding class, May 2026",
};

// The wall around it. n = [col, row] on the 4x4 phone grid (one at cols 2-3,
// rows 2-3); w = [col, row] on the 6x3 wide grid (one at cols 3-4, rows 1-2).
// A tile without n shows at 768 px and up only. All 14 are from 2026.
// To swap a photo, change its `photo` (and alt); positions stay.
export const wallPhotos = [
  { id: "rc-crowd", photo: local("wall/rc-crowd"), event: "Ribbon cutting, Nov 15 2026",
    alt: "A packed room watching the ribbon line, phones raised.", n: [1, 1], w: [1, 1] },
  { id: "sf-street", photo: flickr("65535/55482912099_ba4d64526a", "65535/55482912099_5bcf20f6f0_h"), event: "Sweat Fest, Aug 22 2026",
    alt: "A class moving together on the street under the trees.", n: [2, 1], w: [2, 1] },
  { id: "gala-chandeliers", photo: flickr("65535/55551292582_d14be7b3f4", "65535/55551292582_cc3a67c5d3_h"), event: "Gala, Sep 25 2026",
    alt: "Friends in evening dresses under a ceiling of woven lamps.", n: [3, 1], w: [5, 1] },
  { id: "rc-everyone", photo: local("wall/rc-everyone"), event: "Ribbon cutting, Nov 15 2026",
    alt: "A big group kneeling and standing around glowing LSP letters.", n: [4, 1], w: [6, 1] },
  { id: "grad-selfie", photo: local("wall/grad-selfie"), event: "YTT graduation, Aug 7 2026",
    alt: "A huge group selfie in the studio.", n: [1, 2], w: [1, 2] },
  { id: "sf-dance", photo: flickr("65535/55483127785_d40bc783f9", "65535/55483127785_5819958b03_h"), event: "Sweat Fest, Aug 22 2026",
    alt: "A dance class in the street on a sunny day.", n: [4, 2], w: [2, 2] },
  { id: "ddlm-catrinas", photo: local("wall/ddlm-catrinas"), event: "Día de los Muertos, Oct 31 2026",
    alt: "Dancers dressed as catrinas under a tent hung with marigolds.", n: [1, 3], w: [5, 2] },
  { id: "gala-afterdark", photo: flickr("65535/55552311941_4fec75cb35", "65535/55552311941_b23a42deda_h"), event: "Gala, Sep 25 2026",
    alt: "Friends in gowns posing together late in the evening.", n: [4, 3], w: [6, 2] },
  { id: "rc-friends", photo: local("wall/rc-friends"), event: "Ribbon cutting, Nov 15 2026",
    alt: "Three friends smiling close together with coupe glasses.", n: [1, 4], w: [1, 3] },
  { id: "sf-crew", photo: flickr("65535/55481752917_3c5921503d", "65535/55481752917_48d7269c36_h"), event: "Sweat Fest, Aug 22 2026",
    alt: "A crew in matching shirts lined up in front of a painted wall.", n: [2, 4], w: [2, 3] },
  { id: "ddlm-tent", photo: local("wall/ddlm-tent"), event: "Día de los Muertos, Oct 31 2026",
    alt: "An instructor leading a class on the grass under a tent.", n: [3, 4], w: [3, 3] },
  { id: "tb-class", photo: local("wall/tb-class"), event: "Team bonding class, May 2026 (Drive)",
    alt: "A packed studio class leaning back with arms raised under papel picado.", n: [4, 4], w: [4, 3] },
  { id: "ddlm-mariachi", photo: local("wall/ddlm-mariachi"), event: "Día de los Muertos, Oct 31 2026",
    alt: "A class on their mats while musicians play under the tent.", w: [5, 3] },
  { id: "gala-photobooth", photo: flickr("65535/55551293152_80f1243f44", "65535/55551293152_44abf6d705_h"), event: "Gala, Sep 25 2026",
    alt: "Friends leaning in together for a photo.", w: [6, 3] },
];

// Timeline photos (2026 chapter), full frame. w/h are the intrinsic sizes.
export const storyPhotos = {
  grad: { photo: local("story/grad-cohort"), w: 1024, h: 683,
    alt: "Two rows of new teachers in the studio, almost everyone holding a certificate." },
  sweatfest: { photo: flickr("65535/55482924169_d260bcdb57", "65535/55482924169_7dee2c38a9_h"), w: 1024, h: 683,
    alt: "Rows of people resting on their mats in the street." },
  gala: { photo: flickr("65535/55552697595_d229c43966", "65535/55552697595_56f0bd6059_h"), w: 1024, h: 683,
    alt: "A large group gathered together after the fashion show." },
  ddlm: { photo: local("story/ddlm-class"), w: 1400, h: 934,
    alt: "A class on mats on the grass under a big white tent." },
  ribbon: { photo: local("story/armsup"), w: 1400, h: 788,
    alt: "People cheering beside the cut red ribbon." },
  // 2025 chapter: teacher training (Drive folder "[VIDEO] 2025 LSP TT").
  tt2025: { photo: local("story/tt-2025"), w: 1400, h: 1050,
    alt: "Four trainees laughing together on the studio floor, notes spread around them." },
};
