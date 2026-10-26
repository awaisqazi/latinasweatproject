// Halloween flair for the Sat Oct 31 surfaces (the #saturday block on
// /diadelosmuertos, the /events Saturday strip, the /links
// #halloween-card, the two Oct 31 event cards and the homepage mini
// program's Saturday header). Drawn from the Oct 31 program flyer
// (marketing/fall-events/flyers/oct31-halloween-program.png: skeleton,
// ghost and pumpkin yogis on mats, bats, candy corn, little stars) but in
// the Día de los Muertos cut-paper language of src/lib/ddlmFlair.ts: flat
// shapes, black + white + ORANGE only (the flyer's purple / teal / green
// stay in the flyer). Rendered by src/components/HalloweenFlair.astro.
//
// Every motif is a function of its colors and returns the inner markup
// of an <svg> whose viewBox is `vb` (width w, height h, used for sizing):
//   ink:    outlines, bat, mats, eyes (black on light grounds, white on dark)
//   paper:  the white of the ghost sheet, bones, candy-corn tip
//   ground: cut lines punched in the host's ground (pumpkin ridges, bat eyes)
// No ids inside the markup, so any number can sit on one page. Classes
// hook the motion in HalloweenFlair.astro: .hw-sheet (ghost bob),
// .hw-wing (bat flap), .hw-glow (pumpkin face flicker), .hw-twinkle.
import { ORANGE } from "@/lib/ddlmFlair";

export type HwColors = { ink: string; paper: string; ground: string; dark: boolean };
export type HwMotif = { w: number; h: number; vb: string; svg: (c: HwColors) => string };

export const hwColors = (tone: "light" | "dark", ground?: string): HwColors =>
  tone === "dark"
    ? { ink: "#FFFFFF", paper: "#000000", ground: ground ?? "#000000", dark: true }
    : { ink: "#000000", paper: "#FFFFFF", ground: ground ?? "#FFFFFF", dark: false };

// Ghost in tree pose: the sheet rises to a point (hands together overhead),
// one orange leg standing on the mat, the other bent into the knee.
const ghost: HwMotif = {
  w: 40,
  h: 58,
  vb: "0 0 40 58",
  svg: ({ ink, paper }) =>
    `<rect x="5" y="53" width="30" height="3.4" rx="1.7" fill="${ink}"/>` +
    `<path d="M20 30V53.2" stroke="${ORANGE}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M20 41.5L27.5 44.5L21 48" fill="none" stroke="${ORANGE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<g class="hw-sheet">` +
    `<path d="M20 1.8C21.9 1.8 22.6 3.6 22.1 5.6C28.4 7.6 31.6 13 31.6 21V39.5Q29.7 42.6 27.8 39.5Q25.9 42.6 24 39.5Q22.1 42.6 20.2 39.5Q18.3 42.6 16.4 39.5Q14.5 42.6 12.6 39.5Q10.4 42.6 8.4 39.5V21C8.4 13 11.6 7.6 17.9 5.6C17.4 3.6 18.1 1.8 20 1.8Z" fill="${paper}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<ellipse cx="16.6" cy="19" rx="1.7" ry="2.4" fill="${ink}"/>` +
    `<ellipse cx="23.4" cy="19" rx="1.7" ry="2.4" fill="${ink}"/>` +
    `<ellipse cx="20" cy="25.5" rx="1.3" ry="1.8" fill="${ink}"/>` +
    `</g>`,
};

// Skeleton in warrior II on an orange mat: white bones outlined in ink,
// arms level, front knee bent, back leg long.
const BONES = "M7 21H53M30 33L18 42L15.5 53M30 33L45 53";
const skeleton: HwMotif = {
  w: 60,
  h: 58,
  vb: "0 0 60 58",
  svg: ({ ink, paper }) =>
    `<rect x="4" y="53" width="52" height="3.4" rx="1.7" fill="${ORANGE}"/>` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${BONES}" stroke="${ink}" stroke-width="3.8"/>` +
    `<path d="${BONES}" stroke="${paper}" stroke-width="1.3"/>` +
    `</g>` +
    `<rect x="26.6" y="18.5" width="6.8" height="16" rx="2" fill="${ink}"/>` +
    `<path d="M27.9 22.6H32.1M27.9 25.9H32.1M27.9 29.2H32.1" stroke="${paper}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<circle cx="7" cy="21" r="2" fill="${ink}"/><circle cx="53" cy="21" r="2" fill="${ink}"/>` +
    `<circle cx="30" cy="11" r="6.4" fill="${paper}" stroke="${ink}" stroke-width="1.5"/>` +
    `<circle cx="27.6" cy="10.6" r="1.7" fill="${ink}"/><circle cx="32.4" cy="10.6" r="1.7" fill="${ink}"/>` +
    `<path d="M30 12.6L29 14.4H31Z" fill="${ink}"/>` +
    `<path d="M27.4 15.6H32.6M28.7 14.9V16.3M30 14.9V16.3M31.3 14.9V16.3" stroke="${ink}" stroke-width="0.8"/>`,
};

// Jack-o'-lantern resting on a mat: a black cut-paper pumpkin (white edge
// on dark grounds) whose carved face glows ORANGE and flickers to white
// (the .hw-glow layer, opacity only).
const FACE =
  `<path d="M17.5 21L20.5 16L23.5 21Z"/><path d="M28.5 21L31.5 16L34.5 21Z"/>` +
  `<path d="M25 24.6L26 22.6L27 24.6Z"/>` +
  `<path d="M16.5 26.5Q26 34.6 35.5 26.5Q26 30.2 16.5 26.5Z"/>`;
const pumpkin: HwMotif = {
  w: 52,
  h: 40,
  vb: "0 0 52 40",
  svg: ({ ink, ground, dark }) => {
    const body = "#000000";
    const edge = dark ? ` stroke="#FFFFFF" stroke-width="1.2"` : "";
    return (
      `<rect x="3" y="35" width="46" height="3.4" rx="1.7" fill="${ink}"/>` +
      `<path d="M24.6 12C24.6 8.2 25.6 5.6 28.6 4.4L29.8 6.3C27.7 7.3 27.2 9.2 27.4 12Z" fill="${ORANGE}"/>` +
      `<g fill="${body}"${edge}>` +
      `<ellipse cx="17" cy="23.5" rx="10.5" ry="10.5"/><ellipse cx="35" cy="23.5" rx="10.5" ry="10.5"/>` +
      `<ellipse cx="26" cy="23" rx="12" ry="11.5"/>` +
      `</g>` +
      (dark ? "" : `<path d="M19.6 13.2Q15.2 23.4 19.6 33.6M32.4 13.2Q36.8 23.4 32.4 33.6" fill="none" stroke="${ground}" stroke-width="0.9"/>`) +
      `<g fill="${ORANGE}">${FACE}</g>` +
      `<g class="hw-glow" fill="#FFFFFF">${FACE}</g>` +
      `<g fill="${body}"><rect x="22.6" y="27.7" width="2" height="1.9"/><rect x="27.6" y="27.7" width="2" height="1.9"/></g>`
    );
  },
};

// Bat, wings out; each wing is its own .hw-wing group (the right one is
// the left one mirrored by its parent, so CSS can flap both with scaleX).
const WING =
  "M20 7.5C16 4.5 10 3.5 3 6.5C5.5 7.5 6.5 9 6.6 11C8.4 9.8 10.4 9.8 11.8 11.4C13 9.8 15.2 9.6 16.6 10.8C17.4 9.6 18.6 9.6 20.4 10.6Z";
const bat: HwMotif = {
  w: 44,
  h: 18,
  vb: "0 0 44 18",
  svg: ({ ink, ground }) =>
    `<g fill="${ink}">` +
    `<g class="hw-wing"><path d="${WING}"/></g>` +
    `<g transform="translate(44 0) scale(-1 1)"><g class="hw-wing"><path d="${WING}"/></g></g>` +
    `<ellipse cx="22" cy="10" rx="3.2" ry="4.6"/><circle cx="22" cy="5.8" r="2.8"/>` +
    `<path d="M19.7 4.6L20.4 1.2L22 3.6L23.6 1.2L24.3 4.6Z"/>` +
    `</g>` +
    `<circle cx="20.9" cy="5.7" r="0.6" fill="${ground}"/><circle cx="23.1" cy="5.7" r="0.6" fill="${ground}"/>`,
};

// Candy corn: white tip, orange middle, ink base, one ink outline.
const CORN = "M8 1.5C9.6 1.5 14.6 13.5 14.6 16.2C14.6 18.2 11.6 18.8 8 18.8C4.4 18.8 1.4 18.2 1.4 16.2C1.4 13.5 6.4 1.5 8 1.5Z";
const candyCorn: HwMotif = {
  w: 16,
  h: 20,
  vb: "0 0 16 20",
  svg: ({ ink, paper }) =>
    `<path d="${CORN}" fill="${ink}"/>` +
    `<path d="M8 1.5C9.4 1.5 12.7 9.2 13.9 13.6H2.1C3.3 9.2 6.6 1.5 8 1.5Z" fill="${ORANGE}"/>` +
    `<path d="M8 1.5C8.9 1.5 10.6 5.2 11.6 8H4.4C5.4 5.2 7.1 1.5 8 1.5Z" fill="${paper}"/>` +
    `<path d="${CORN}" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`,
};

// Four-point sparkle (the flyer's little stars), ORANGE.
const sparkle: HwMotif = {
  w: 16,
  h: 16,
  vb: "-8 -8 16 16",
  svg: () => `<path class="hw-twinkle" d="M0 -7.4Q1 -1 7.4 0Q1 1 0 7.4Q-1 1 -7.4 0Q-1 -1 0 -7.4Z" fill="${ORANGE}"/>`,
};

export const HW_MOTIFS = { ghost, skeleton, pumpkin, bat, candyCorn, sparkle } as const;
export type HwName = keyof typeof HW_MOTIFS;
