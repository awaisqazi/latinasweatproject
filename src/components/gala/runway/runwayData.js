// Build-time view model for /gala/fashion-show ("The Runway"). Everything is
// derived from the data files, never hand-typed here:
//   looks and finale:  src/data/galaFashionShow2026.js (album indexes)
//   photo URLs:        src/data/galaGallery2026.js (Flickr stems)
//   designer links:    galaFashionShow.brands in src/data/galaTeaser.js
//   white marks:       galaSponsors2026.designers in src/data/galaRecap2026.js
// PRIVACY: looks are numbered only. Alt text never names or describes the
// people or the clothes, and a designer credit appears only when the data
// sets it (null means no credit text at all).
import { galaRunway } from "@/data/galaFashionShow2026";
import {
  galaAlbumCdnBase,
  galaPhotoCount,
  galaPhotoStems,
} from "@/data/galaGallery2026";
import { galaFashionShow } from "@/data/galaTeaser";
import { galaSponsors2026 } from "@/data/galaRecap2026";

export const RUNWAY_PATH = "/gala/fashion-show";
export const RUNWAY_URL = `https://latinasweatproject.com${RUNWAY_PATH}`;
export const pad2 = (n) => String(n).padStart(2, "0");

const cdn = galaAlbumCdnBase;

// One album photo as its three renditions: _c 800px (cards, thumbnails),
// _b 1024px (the phone stage) and the stored _h 1600px (tall stages).
function photo(i) {
  const p = galaPhotoStems[i];
  if (!p) throw new Error(`runwayData: album index ${i} does not exist`);
  return {
    i,
    o: p.o,
    c: `${cdn}${p.t}_c.jpg`,
    b: `${cdn}${p.t}_b.jpg`,
    h: `${cdn}${p.f}.jpg`,
  };
}

const instagramOf = (brand) =>
  brand.socials?.find((s) => s.type === "instagram")?.url || brand.url;

function brandByName(name) {
  const brand = galaFashionShow.brands.find((b) => b.name === name);
  if (!brand) {
    throw new Error(
      `runwayData: designer "${name}" does not match any galaFashionShow.brands name`,
    );
  }
  return brand;
}

const total = galaRunway.looks.length;

export const runwayLooks = galaRunway.looks.map((look, k) => {
  const n = k + 1;
  const hero = look.frames.indexOf(look.hero);
  if (hero < 0) throw new Error(`runwayData: look ${n} hero is not one of its frames`);
  const brand = look.designer ? brandByName(look.designer) : null;
  return {
    n,
    num: pad2(n),
    frames: look.frames.map((i, f) => ({
      ...photo(i),
      alt: `Look ${n} on the runway at the MCA, frame ${f + 1} of ${look.frames.length}`,
    })),
    hero,
    heroPhoto: photo(look.hero),
    designer: brand ? { name: brand.name, instagram: instagramOf(brand) } : null,
  };
});

export const runwayTotal = total;

export const runwayFinale = {
  walk: galaRunway.finale.walk.map((i, f) => ({
    ...photo(i),
    alt: `The finale walk on the runway at the MCA, frame ${f + 1} of ${galaRunway.finale.walk.length}`,
  })),
  group: {
    ...photo(galaRunway.finale.group),
    alt: "The designers and models together after the show at the MCA",
  },
};

export const runwayCover = photo(galaRunway.cover);

// The six designers in running order. The white knockout marks (dark plates
// only) come from the sponsor data in the same order; guard the pairing.
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
export const runwayDesigners = galaFashionShow.brands.map((b, k) => {
  const white = galaSponsors2026.designers[k];
  const firstWord = norm(white?.name.split(" ")[0] || "");
  if (!white || !norm(b.name).includes(firstWord)) {
    throw new Error(`runwayData: designer mark ${k} does not pair with brand "${b.name}"`);
  }
  return {
    name: b.name,
    instagram: instagramOf(b),
    logo: `/images/gala/fashion/${b.logo}`,
    // "dark" tiles carry white artwork, which disappears on a cream tag:
    // those tags set the name in small caps instead of the logo.
    logoOnCream: b.tile !== "dark",
    white: { src: white.logo, scale: Number(white.scale) || 1, maxH: Number(white.maxH) || 1 },
  };
});

export const runwayAnyUncredited = runwayLooks.some((l) => !l.designer);
export const runwayPhotoCount = galaPhotoCount;

// The client payload for the player (kept small: URLs + alt + credits).
export const runwayClientData = {
  url: RUNWAY_URL,
  total,
  looks: runwayLooks.map((l) => ({
    n: l.n,
    num: l.num,
    hero: l.hero,
    designer: l.designer,
    frames: l.frames.map(({ c, b, h, alt }) => ({ c, b, h, alt })),
  })),
  finale: runwayFinale.walk.map(({ c, b, h, alt }) => ({ c, b, h, alt })),
};
