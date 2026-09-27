// Annual Gala 2026 fashion show, replayed: the runway looks as data for the
// /gala/fashion-show experience. Built 2026-09-26 from the official album
// (src/data/galaGallery2026.js); every number below is an index into
// galaPhotoStems, so URLs, orientation and clock time come from there.
//
// How the looks were cut: the show ran 10:12 to 10:33 PM (camera clock) on the
// fourth floor. The photographer shot a burst per walk (approach, close-up,
// turn, walk away); each burst is one look, in clock order. The 9:40 PM
// frames (#134 to #148) are an earlier walkthrough in a near-empty room and
// are left out; so are guest portraits between walks.
//
// DESIGNERS: deliberately null. No source we have ties a look to a brand
// (the brands' own shop photos do not show these pieces), and the organizer
// asked to credit designers later rather than guess. When a look is
// confirmed, set `designer` to the brand's `name` exactly as it appears in
// galaFashionShow.brands (src/data/galaTeaser.js) and the player and the
// lookbook show the credit with the brand's links. Never infer it from the
// clothes.
//

export const galaRunway = {
  title: "The Runway",
  eyebrow: "Annual Gala 2026 · Fourth floor, MCA Chicago",
  // Cover image: the finale walk, runway lined with guests on both sides.
  cover: 266,
  // Every look follows the same grammar so the show reads the same way
  // twenty times: `walk` = ONE distant walk-out frame (the approach), or
  // null when the burst has none; `front` = the close-up, the frame the show
  // holds on and the lookbook card; `back` = one back view or walk-away
  // frame, shown only when the viewer flips the look, or null. Classified by
  // eye from the contact sheets on 2026-09-27; the rest of each burst
  // (near-duplicates, side angles) is left in the album, not in the show.
  looks: [
    { walk: 149, front: 151, back: 152, designer: null },
    { walk: null, front: 154, back: 155, designer: null },
    { walk: 156, front: 158, back: 159, designer: null },
    { walk: 161, front: 164, back: null, designer: null },
    { walk: 166, front: 168, back: 171, designer: null },
    { walk: 173, front: 176, back: 178, designer: null },
    { walk: 183, front: 186, back: null, designer: null },
    { walk: 189, front: 193, back: 194, designer: null },
    { walk: 199, front: 202, back: null, designer: null },
    { walk: null, front: 204, back: null, designer: null },
    { walk: 206, front: 208, back: null, designer: null },
    { walk: 210, front: 212, back: null, designer: null },
    { walk: 214, front: 216, back: 219, designer: null },
    { walk: 223, front: 226, back: 228, designer: null },
    { walk: 233, front: 236, back: null, designer: null },
    { walk: 242, front: 245, back: null, designer: null },
    { walk: 246, front: 248, back: 249, designer: null },
    { walk: 253, front: 257, back: null, designer: null },
    { walk: 259, front: 261, back: 262, designer: null },
    { walk: null, front: 273, back: 270, designer: null },
  ],
  // After the last look: the whole cast walks once more, then the group photo
  // in front of the gallery wall (landscape frames).
  finale: {
    walk: [266, 267, 268, 269],
    group: 283,
  },
};
