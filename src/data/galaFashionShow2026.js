// Annual Gala 2026 fashion show, replayed: the runway looks as data for the
// /gala/fashion-show experience. Built 2026-09-26 from the official album
// (src/data/galaGallery2026.js); every number below is an index into
// galaPhotoStems, so URLs, orientation and clock time come from there.
//
// How the looks were cut: the show ran 10:12 to 10:33 PM (camera clock) on the
// fourth floor. The photographer shot a burst per walk (approach, close-up,
// turn, walk away), so consecutive frames of one outfit form one look, in
// clock order. The 9:40 PM frames (#134 to #148) are an earlier walkthrough in
// a near-empty room and are left out; so are guest portraits between walks.
//
// DESIGNERS: deliberately null. No source we have ties a look to a brand
// (the brands' own shop photos do not show these pieces), and the organizer
// asked to credit designers later rather than guess. When a look is
// confirmed, set `designer` to the brand's `name` exactly as it appears in
// galaFashionShow.brands (src/data/galaTeaser.js) and the player and the
// lookbook show the credit with the brand's links. Never infer it from the
// clothes.
//
// `hero`: the frame the player holds on (usually the close-up) and the
// lookbook card image. Must be one of `frames`.

export const galaRunway = {
  title: "The Runway",
  eyebrow: "Annual Gala 2026 · Fourth floor, MCA Chicago",
  // Cover image: the finale walk, runway lined with guests on both sides.
  cover: 266,
  looks: [
    { frames: [149, 150, 151, 152, 153], hero: 151, designer: null },
    { frames: [154, 155], hero: 154, designer: null },
    { frames: [156, 157, 158, 159], hero: 158, designer: null },
    { frames: [160, 161, 162, 163, 164, 165], hero: 164, designer: null },
    { frames: [166, 167, 168, 169, 170, 171], hero: 168, designer: null },
    { frames: [172, 173, 174, 175, 176, 177, 178, 179, 180], hero: 176, designer: null },
    { frames: [181, 182, 183, 184, 185, 186], hero: 186, designer: null },
    { frames: [187, 188, 189, 190, 191, 192, 193, 194, 195, 196], hero: 193, designer: null },
    { frames: [197, 198, 199, 200, 201, 202, 203], hero: 202, designer: null },
    { frames: [204], hero: 204, designer: null },
    { frames: [205, 206, 207, 208], hero: 208, designer: null },
    { frames: [209, 210, 211, 212], hero: 212, designer: null },
    { frames: [213, 214, 215, 216, 217, 218, 219], hero: 216, designer: null },
    { frames: [220, 221, 222, 223, 224, 225, 226, 227, 228, 229], hero: 226, designer: null },
    { frames: [230, 231, 232, 233, 234, 235, 236, 237, 238, 239], hero: 236, designer: null },
    { frames: [240, 241, 242, 243, 244, 245], hero: 245, designer: null },
    { frames: [246, 247, 248, 249, 250, 251], hero: 249, designer: null },
    { frames: [252, 253, 254, 255, 256, 257], hero: 257, designer: null },
    { frames: [258, 259, 260, 261, 262, 263, 264, 265], hero: 262, designer: null },
    { frames: [270, 271, 272, 273, 274, 275, 276], hero: 273, designer: null },
  ],
  // After the last look: the whole cast walks once more, then the group photo
  // in front of the gallery wall (landscape frames).
  finale: {
    walk: [266, 267, 268, 269],
    group: 283,
  },
};
