// Día de los Muertos weekend 2026 photo album for /diadelosmuertos.
//
// Three sets, one album on the page (src/components/DdlmRecapAlbum.astro):
//   1. ddlmSaturdayPhotos: the 208 frames of Estevan Cruz's Flickr album, all
//      shot Saturday Oct 31 between 10:22 AM and 1:02 PM, in album order
//      (which is clock order). Served from the Flickr CDN.
//   2. ddlmMakingPhotos: 23 team phone photos from the Oct 28 ofrenda-making
//      night, from the staff Discord (marketing/ddlm-recap/discord/
//      ofrenda-making-oct28). Not on Flickr, so self-hosted as webp by
//      marketing/ddlm-recap/prepare.mjs under public/images/ddlm/recap/album/.
//   3. ddlmSundayPhotos: EMPTY. There are no Sunday photos yet.
//
// ADDING THE SUNDAY ALBUM (data only, no page or component edits):
//   a. node scripts/pull-flickr-album.mjs <albumId> sunday
//      and paste the rows into ddlmSundayPhotos below. The script prints the
//      dates taken: check they say 2026-11-01 before pasting. If the album
//      mixes days, keep only the Sunday frames.
//   b. Fill in ddlmAlbums.sunday (album url, photographer).
//   c. Optional: pick lead frames in ddlmRecapPhotos.leads.sunday
//      (src/data/ddlmRecap2026.js, `{ sun: <row index>, big: true, ... }`).
//      With no leads the chapter renders as a plain thumbnail wall.
//   d. Optional: split Sunday into more chapters by adding entries to
//      ddlmAlbumChapters with day: "sunday" and changing each row's `c`.
// The Sunday chapter appears, the photo total updates, the section heading,
// intro and meta description switch to their two-day wording and the lightbox
// carries the new credit on their own.
// A row whose `c` matches no chapter fails the build.
//
// Flickr rows, same format and same gotcha as galaGallery2026.js:
//   t:  BASE stem, no size suffix. Append _q (150px square), _c (800px) or _b
//       (1024px): all share this secret.
//   f:  the _h 1600px rendition. _h uses a DIFFERENT per-size secret, so this
//       stem is stored whole and can never be derived from t.
//   o:  orientation of the _c rendition, "l" (800x533) or "p" (533x800).
//   at: HH:MM from Flickr's date_taken (camera clock, Chicago).
//   c:  chapter key. Chapters are cut by what each frame shows, not by the
//       clock: the ofrendas and the band turn up all morning.
// Pulled 2026-11-01 via flickr.photosets.getPhotos.
//
// Never caption who is pictured. Chapter labels name the moment or an act,
// never a person, so class leaders are named in the program, not over photos.

export const ddlmCdnBase = "https://live.staticflickr.com/";
// Under public/, prefixed with BASE_URL where it is used.
export const ddlmLocalBase = "images/ddlm/recap/album/";

export const ddlmPhotographer = {
  name: "Estevan Cruz",
  instagram: "@estevansta",
  instagramUrl: "https://www.instagram.com/estevansta/",
};

// One entry per Flickr album. A set with no photos renders nothing.
export const ddlmAlbums = {
  saturday: {
    url: "https://www.flickr.com/photos/88623248@N07/albums/72177720336422225",
    photographer: ddlmPhotographer,
  },
  // Fill in when the Sunday album lands: url + photographer ({ name,
  // instagram, instagramUrl }, instagram fields optional).
  sunday: {
    url: null,
    photographer: null,
  },
};

// The weekend in chapters, in date order. `key` matches each photo's `c`.
// `album` picks the credit: "saturday", "sunday" or "team". A chapter with no
// photos does not render.
export const ddlmAlbumChapters = [
  {
    key: "making",
    album: "team",
    time: "Wednesday, October 28",
    title: "Making the ofrendas",
    detail: "Paint, paper and marigolds: the calaveras and crosses were made by hand before the weekend. Phone photos from the team.",
  },
  {
    key: "ofrendas",
    album: "saturday",
    time: "Saturday, from 9:00 AM",
    title: "The ofrendas",
    detail: "Community altars and hot drinks to open the day.",
  },
  {
    key: "kids",
    album: "saturday",
    time: "Saturday, 10:30 AM",
    title: "Kids yoga",
    detail: "A child-parent class in costume.",
  },
  {
    key: "banda",
    album: "saturday",
    time: "Saturday, 11:00 AM",
    title: "Banda Cerro Azul",
    detail: "The 11:00 AM set, then back for the 12:30 PM class.",
  },
  {
    key: "market",
    album: "saturday",
    time: "Saturday morning",
    title: "Warm meals and fresh produce",
    detail: "Warm meals from OrganicLife, and fresh fruits and vegetables from Sharing Excess for the community grocery giveaway.",
  },
  {
    key: "costume",
    album: "saturday",
    time: "Saturday morning",
    title: "Catrinas, costumes and trick or treat",
    detail: "Flower crowns, face paint and the farmers market.",
  },
  {
    key: "pilates",
    album: "saturday",
    time: "Saturday, 12:30 PM",
    title: "Banda Pilates + Sculpt",
    detail: "A full-body workout with Banda Cerro Azul playing live.",
  },
  // Empty until ddlmSundayPhotos is filled in.
  {
    key: "sunday",
    album: "sunday",
    time: "Sunday, November 1",
    title: "Día de los Muertos",
    detail: "Ofrenda viewing, gentle yoga, banda, mariachi, danza azteca, grief meditation and sound bath.",
  },
];

// Oct 28 ofrenda-making night, self-hosted. Renditions: <id>_q.webp (320
// square), <id>_c.webp (750x1000), <id>_h.webp (1200x1600).
export const ddlmMakingPhotos = [
  { id: "IMG_1126", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1127", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1128", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1130", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1131", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1132", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1133", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1135", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1136", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1138", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1139", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1141", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1146", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1147", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1150", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1152", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1155", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1156", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_1160", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_2012", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_5881", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_5882", o: "p", w: 750, h: 1000, c: "making" },
  { id: "IMG_5885", o: "p", w: 750, h: 1000, c: "making" },
];

export const ddlmSaturdayPhotos = [
  { t: "65535/55624282180_e47a12122a", f: "65535/55624282180_2454afccdd_h", o: "l", at: "10:22", c: "kids" },
  { t: "65535/55622857817_1d3821dabf", f: "65535/55622857817_179784bd42_h", o: "l", at: "10:25", c: "kids" },
  { t: "65535/55624066674_c86c596737", f: "65535/55624066674_6d2a3babfe_h", o: "p", at: "10:26", c: "kids" },
  { t: "65535/55624066669_5af20fa159", f: "65535/55624066669_41f08c6f69_h", o: "p", at: "10:34", c: "kids" },
  { t: "65535/55624282225_c94291a41f", f: "65535/55624282225_b5b6153e4e_h", o: "p", at: "10:37", c: "costume" },
  { t: "65535/55623995828_2bb43974d5", f: "65535/55623995828_fa7cdd03da_h", o: "p", at: "10:38", c: "kids" },
  { t: "65535/55624282000_6e5cc6bb6d", f: "65535/55624282000_a04b3a59d7_h", o: "p", at: "10:38", c: "kids" },
  { t: "65535/55622857497_39083038e8", f: "65535/55622857497_16068854f6_h", o: "l", at: "10:38", c: "kids" },
  { t: "65535/55623995668_ea16a21d9c", f: "65535/55623995668_e712055350_h", o: "p", at: "10:39", c: "market" },
  { t: "65535/55624066309_73c0c1a7cb", f: "65535/55624066309_b81c687681_h", o: "p", at: "10:39", c: "market" },
  { t: "65535/55624281705_af945b15c9", f: "65535/55624281705_18d4b05ea4_h", o: "p", at: "10:40", c: "market" },
  { t: "65535/55624282095_1d12abcf05", f: "65535/55624282095_ae0b14c771_h", o: "p", at: "10:40", c: "market" },
  { t: "65535/55622857272_02d1bfa44f", f: "65535/55622857272_c0b35f026c_h", o: "p", at: "10:40", c: "market" },
  { t: "65535/55624281620_3f23bb1ab6", f: "65535/55624281620_a09145cd00_h", o: "p", at: "10:40", c: "market" },
  { t: "65535/55624281570_e24e1786e5", f: "65535/55624281570_3ae1599909_h", o: "p", at: "10:41", c: "market" },
  { t: "65535/55622857542_280c6137a9", f: "65535/55622857542_6c28af2e33_h", o: "l", at: "10:41", c: "market" },
  { t: "65535/55623856661_fa75781d28", f: "65535/55623856661_2dde1c7e01_h", o: "p", at: "10:41", c: "market" },
  { t: "65535/55623995278_5a2d575422", f: "65535/55623995278_8975c3f1d8_h", o: "p", at: "10:43", c: "costume" },
  { t: "65535/55624281365_0b55740f43", f: "65535/55624281365_a23326f2c6_h", o: "p", at: "10:43", c: "costume" },
  { t: "65535/55623856471_6099e8162f", f: "65535/55623856471_283624a9c6_h", o: "p", at: "10:44", c: "costume" },
  { t: "65535/55624065799_e48302780c", f: "65535/55624065799_4d4edd12e4_h", o: "l", at: "10:45", c: "kids" },
  { t: "65535/55624065759_5120df81d1", f: "65535/55624065759_a1508dd779_h", o: "p", at: "10:45", c: "costume" },
  { t: "65535/55622856757_60cb874bf5", f: "65535/55622856757_e481ea87ea_h", o: "p", at: "10:45", c: "costume" },
  { t: "65535/55624066089_5a6497b8b1", f: "65535/55624066089_c652074bab_h", o: "p", at: "10:45", c: "costume" },
  { t: "65535/55622856732_867ce6b02c", f: "65535/55622856732_d0661d2875_h", o: "l", at: "10:48", c: "kids" },
  { t: "65535/55623856161_9412379d76", f: "65535/55623856161_b1881d8314_h", o: "l", at: "10:48", c: "kids" },
  { t: "65535/55623856121_0466ae9593", f: "65535/55623856121_67d8b154b1_h", o: "l", at: "10:48", c: "kids" },
  { t: "65535/55623856086_104460e94c", f: "65535/55623856086_b8191ae16b_h", o: "l", at: "10:48", c: "kids" },
  { t: "65535/55623856031_d6f5f0a3cd", f: "65535/55623856031_cc53a88758_h", o: "l", at: "10:48", c: "kids" },
  { t: "65535/55624057224_f4457aa0ed", f: "65535/55624057224_cdfd3fee38_h", o: "l", at: "10:48", c: "kids" },
  { t: "65535/55624281345_fac0e83fbd", f: "65535/55624281345_48874d67c2_h", o: "p", at: "10:50", c: "kids" },
  { t: "65535/55623994723_90773ebda7", f: "65535/55623994723_bbc97f7902_h", o: "p", at: "10:51", c: "kids" },
  { t: "65535/55624280640_0449cc0e99", f: "65535/55624280640_cbc7aeda8c_h", o: "p", at: "10:51", c: "kids" },
  { t: "65535/55623994678_8362e83cc9", f: "65535/55623994678_f86d1d8912_h", o: "p", at: "10:51", c: "kids" },
  { t: "65535/55624280875_26226720a4", f: "65535/55624280875_1ac5b02b5c_h", o: "p", at: "10:51", c: "kids" },
  { t: "65535/55622856367_9db88d65cc", f: "65535/55622856367_9f9f743d1c_h", o: "p", at: "10:52", c: "kids" },
  { t: "65535/55622856362_3003a598a7", f: "65535/55622856362_5b7ad38bd2_h", o: "p", at: "10:52", c: "kids" },
  { t: "65535/55624065239_6f1b363e4f", f: "65535/55624065239_c61ab567c9_h", o: "p", at: "10:52", c: "kids" },
  { t: "65535/55623855761_08e4574349", f: "65535/55623855761_a962119872_h", o: "p", at: "10:52", c: "kids" },
  { t: "65535/55623855951_7fbc53264b", f: "65535/55623855951_a6f15ba330_h", o: "p", at: "10:56", c: "kids" },
  { t: "65535/55623994383_a0d16a1620", f: "65535/55623994383_34ad4782cf_h", o: "p", at: "10:58", c: "costume" },
  { t: "65535/55622848397_324ebfa696", f: "65535/55622848397_262fb82d64_h", o: "l", at: "10:58", c: "costume" },
  { t: "65535/55624065169_1c2514279f", f: "65535/55624065169_2ca7f7f9bb_h", o: "p", at: "10:59", c: "costume" },
  { t: "65535/55623855581_d9dbd43c14", f: "65535/55623855581_7368336ac3_h", o: "p", at: "10:59", c: "costume" },
  { t: "65535/55624065039_1edee8764a", f: "65535/55624065039_3ef86a69ed_h", o: "p", at: "10:59", c: "ofrendas" },
  { t: "65535/55624280160_26b6fd0a16", f: "65535/55624280160_5c880a9efa_h", o: "p", at: "10:59", c: "ofrendas" },
  { t: "65535/55623994128_667cf5c309", f: "65535/55623994128_a5b54a222c_h", o: "p", at: "10:59", c: "ofrendas" },
  { t: "65535/55623994508_b2d45f0999", f: "65535/55623994508_d7c121d0f4_h", o: "l", at: "11:02", c: "kids" },
  { t: "65535/55624280040_26cb11667a", f: "65535/55624280040_d871a909be_h", o: "p", at: "11:05", c: "costume" },
  { t: "65535/55622855872_3e0a3c2c81", f: "65535/55622855872_600420a19a_h", o: "p", at: "11:06", c: "kids" },
  { t: "65535/55624064759_3404646c61", f: "65535/55624064759_427e4d09f6_h", o: "p", at: "11:07", c: "costume" },
  { t: "65535/55624279895_4b91e5504f", f: "65535/55624279895_65c200bc63_h", o: "l", at: "11:11", c: "banda" },
  { t: "65535/55624280325_2d20225f4f", f: "65535/55624280325_928f2f2da4_h", o: "l", at: "11:11", c: "banda" },
  { t: "65535/55623993918_47231b697b", f: "65535/55623993918_d15dc3555e_h", o: "l", at: "11:13", c: "ofrendas" },
  { t: "65535/55622855742_47fd734b62", f: "65535/55622855742_079657e2f2_h", o: "p", at: "11:13", c: "ofrendas" },
  { t: "65535/55623993823_4b7096d464", f: "65535/55623993823_4ad6f3d6f0_h", o: "p", at: "11:13", c: "ofrendas" },
  { t: "65535/55624064589_4d47c7833c", f: "65535/55624064589_cd94833cd8_h", o: "p", at: "11:13", c: "ofrendas" },
  { t: "65535/55623993733_0a69611301", f: "65535/55623993733_36d97bf8e9_h", o: "p", at: "11:13", c: "ofrendas" },
  { t: "65535/55623994038_a32af5e8a9", f: "65535/55623994038_34111bf9a6_h", o: "l", at: "11:14", c: "market" },
  { t: "65535/55623993738_fd47afe43f", f: "65535/55623993738_da8e6d2365_h", o: "l", at: "11:15", c: "market" },
  { t: "65535/55624279770_8d9216db57", f: "65535/55624279770_93cc7beebb_h", o: "p", at: "11:15", c: "costume" },
  { t: "65535/55623993648_ebe8519886", f: "65535/55623993648_d78de93e28_h", o: "p", at: "11:15", c: "costume" },
  { t: "65535/55622855497_ecddbb29a5", f: "65535/55622855497_feb2cc1636_h", o: "p", at: "11:15", c: "market" },
  { t: "65535/55624279445_1c0a0f2580", f: "65535/55624279445_c8c8b61256_h", o: "p", at: "11:16", c: "market" },
  { t: "65535/55623854836_895e0c4dbc", f: "65535/55623854836_bf130ec3b4_h", o: "p", at: "11:16", c: "market" },
  { t: "65535/55622855502_6a565c962a", f: "65535/55622855502_4b36906c0a_h", o: "p", at: "11:16", c: "market" },
  { t: "65535/55623854721_69508425f2", f: "65535/55623854721_01ba659fb7_h", o: "p", at: "11:16", c: "market" },
  { t: "65535/55622855292_5d41a69deb", f: "65535/55622855292_1d42a9f0f0_h", o: "p", at: "11:16", c: "market" },
  { t: "65535/55624064154_f5df35693c", f: "65535/55624064154_fbc398632a_h", o: "p", at: "11:16", c: "market" },
  { t: "65535/55623993558_b44f43cf28", f: "65535/55623993558_9ebf6a207b_h", o: "p", at: "11:21", c: "market" },
  { t: "65535/55623993283_f963e033d1", f: "65535/55623993283_cae9f3e25d_h", o: "p", at: "11:21", c: "market" },
  { t: "65535/55623854526_b3f7986004", f: "65535/55623854526_7714166625_h", o: "p", at: "11:21", c: "market" },
  { t: "65535/55622854992_9915019eb2", f: "65535/55622854992_e30754d623_h", o: "p", at: "11:23", c: "costume" },
  { t: "65535/55623992993_67e9894670", f: "65535/55623992993_eaf25ecc5f_h", o: "p", at: "11:23", c: "ofrendas" },
  { t: "65535/55622854787_4b7f2fc93e", f: "65535/55622854787_2fcaa4ae6c_h", o: "p", at: "11:23", c: "ofrendas" },
  { t: "65535/55623992873_2719c1ba61", f: "65535/55623992873_bc2749e813_h", o: "p", at: "11:30", c: "banda" },
  { t: "65535/55623992718_a7fbf4894c", f: "65535/55623992718_e1ed1df98f_h", o: "l", at: "11:30", c: "costume" },
  { t: "65535/55624064134_898d3805b6", f: "65535/55624064134_20f39ed40b_h", o: "p", at: "11:31", c: "costume" },
  { t: "65535/55623853941_eb2188a2c4", f: "65535/55623853941_87b4da34bb_h", o: "p", at: "11:33", c: "costume" },
  { t: "65535/55622854412_135fcc70d9", f: "65535/55622854412_86faba6837_h", o: "p", at: "11:33", c: "costume" },
  { t: "65535/55624279075_721861f7cb", f: "65535/55624279075_fa680b7941_h", o: "p", at: "11:34", c: "ofrendas" },
  { t: "65535/55624278395_611f188c3e", f: "65535/55624278395_7e0e4203e4_h", o: "l", at: "11:34", c: "market" },
  { t: "65535/55624063334_fba7875b84", f: "65535/55624063334_ffaeb5476f_h", o: "p", at: "11:34", c: "market" },
  { t: "65535/55622854202_d5ca71374d", f: "65535/55622854202_00425bef7d_h", o: "p", at: "11:35", c: "market" },
  { t: "65535/55624278155_3e423babfc", f: "65535/55624278155_9bcebeb5d6_h", o: "p", at: "11:35", c: "market" },
  { t: "65535/55623992158_4fb6b1366b", f: "65535/55623992158_d7b2c19803_h", o: "p", at: "11:35", c: "market" },
  { t: "65535/55624278005_569ab2258b", f: "65535/55624278005_30810a6ab2_h", o: "p", at: "11:35", c: "market" },
  { t: "65535/55624062979_6c1fd91b3d", f: "65535/55624062979_a288ac564e_h", o: "p", at: "11:35", c: "costume" },
  { t: "65535/55624277890_997c4da94e", f: "65535/55624277890_aecce0d5f6_h", o: "l", at: "11:36", c: "costume" },
  { t: "65535/55624062889_bf9ae65e36", f: "65535/55624062889_e25a9e7d69_h", o: "l", at: "11:36", c: "costume" },
  { t: "65535/55624062829_1cfaaf4d68", f: "65535/55624062829_f4e4cf02cb_h", o: "l", at: "11:36", c: "costume" },
  { t: "65535/55623992523_1a9713eeee", f: "65535/55623992523_1b565e4282_h", o: "p", at: "11:36", c: "costume" },
  { t: "65535/55622853697_cbf1667753", f: "65535/55622853697_d7e40343e3_h", o: "l", at: "11:36", c: "costume" },
  { t: "65535/55622853662_25e32a88b0", f: "65535/55622853662_fef8b060d9_h", o: "l", at: "11:37", c: "costume" },
  { t: "65535/55622853507_80a7780594", f: "65535/55622853507_ea99fd18c5_h", o: "l", at: "11:37", c: "costume" },
  { t: "65535/55624278210_26f1394e58", f: "65535/55624278210_c83287321c_h", o: "l", at: "11:37", c: "market" },
  { t: "65535/55623853036_d0e192d8b9", f: "65535/55623853036_ceb3d6afaa_h", o: "l", at: "11:43", c: "ofrendas" },
  { t: "65535/55624271845_65cfbf2cb8", f: "65535/55624271845_2f9d4d8578_h", o: "l", at: "11:43", c: "ofrendas" },
  { t: "65535/55624277440_3454940761", f: "65535/55624277440_99eb5edf5a_h", o: "l", at: "11:43", c: "ofrendas" },
  { t: "65535/55623991493_25281be074", f: "65535/55623991493_88ff97ba9b_h", o: "l", at: "11:43", c: "ofrendas" },
  { t: "65535/55623852931_0dbd4d24e2", f: "65535/55623852931_1565022cf2_h", o: "p", at: "11:43", c: "ofrendas" },
  { t: "65535/55624062654_be268aa4e8", f: "65535/55624062654_5d7f625107_h", o: "p", at: "11:43", c: "ofrendas" },
  { t: "65535/55624277175_661a3d0a73", f: "65535/55624277175_e7278372f2_h", o: "p", at: "11:43", c: "ofrendas" },
  { t: "65535/55623852821_a9db8b9b28", f: "65535/55623852821_a53e348bb2_h", o: "p", at: "11:43", c: "ofrendas" },
  { t: "65535/55622852957_d4506a64ca", f: "65535/55622852957_7741059948_h", o: "p", at: "11:44", c: "costume" },
  { t: "65535/55623852951_2c359ddfbe", f: "65535/55623852951_cb6d4919fe_h", o: "p", at: "11:45", c: "ofrendas" },
  { t: "65535/55624277015_1fa98df2d3", f: "65535/55624277015_cb1bc3d8cb_h", o: "p", at: "11:45", c: "costume" },
  { t: "65535/55624061929_4a2bdd1e7a", f: "65535/55624061929_db9ffe67d6_h", o: "l", at: "11:46", c: "costume" },
  { t: "65535/55623852581_769b00f5d9", f: "65535/55623852581_321dfb9fd3_h", o: "l", at: "11:47", c: "costume" },
  { t: "65535/55623847661_6090042683", f: "65535/55623847661_3f155ebce7_h", o: "p", at: "11:47", c: "costume" },
  { t: "65535/55624062134_b77b256a0e", f: "65535/55624062134_23cebe5444_h", o: "p", at: "11:48", c: "costume" },
  { t: "65535/55622852652_9c488b5a32", f: "65535/55622852652_b708f10f50_h", o: "p", at: "11:48", c: "costume" },
  { t: "65535/55623990868_af1f7cc8f7", f: "65535/55623990868_c1bd642ccf_h", o: "l", at: "11:48", c: "banda" },
  { t: "65535/55623990713_a4f6832f20", f: "65535/55623990713_b162ac6d1a_h", o: "l", at: "11:48", c: "banda" },
  { t: "65535/55623991018_25eb25999e", f: "65535/55623991018_0da26562da_h", o: "l", at: "11:48", c: "banda" },
  { t: "65535/55623990708_74671cb1f3", f: "65535/55623990708_3aef90f135_h", o: "l", at: "11:48", c: "banda" },
  { t: "65535/55624276395_1fabfd9e08", f: "65535/55624276395_3133ba0db0_h", o: "l", at: "11:48", c: "costume" },
  { t: "65535/55623852111_65203c0a66", f: "65535/55623852111_33bb736188_h", o: "l", at: "11:55", c: "costume" },
  { t: "65535/55623990538_6b8fdf6818", f: "65535/55623990538_703fcef3f6_h", o: "l", at: "11:56", c: "costume" },
  { t: "65535/55623990513_67bf6df9d2", f: "65535/55623990513_0217d0462f_h", o: "l", at: "11:56", c: "costume" },
  { t: "65535/55623990463_67513b71b1", f: "65535/55623990463_819dffa843_h", o: "p", at: "11:57", c: "costume" },
  { t: "65535/55624061334_f6d8d8a47f", f: "65535/55624061334_e228c700a6_h", o: "p", at: "11:57", c: "costume" },
  { t: "65535/55623990738_d21a5f4124", f: "65535/55623990738_04aabc539e_h", o: "l", at: "12:00", c: "costume" },
  { t: "65535/55623851911_c0b8bde45a", f: "65535/55623851911_47c93d95e1_h", o: "l", at: "12:01", c: "costume" },
  { t: "65535/55622852117_8b6006a503", f: "65535/55622852117_006c9dcf5b_h", o: "p", at: "12:10", c: "costume" },
  { t: "65535/55622852072_344ed171b4", f: "65535/55622852072_dfd17ca6ed_h", o: "p", at: "12:11", c: "costume" },
  { t: "65535/55624061099_27b91c2e13", f: "65535/55624061099_03efb0d9dd_h", o: "p", at: "12:11", c: "costume" },
  { t: "65535/55623990598_9f924b3ede", f: "65535/55623990598_f4c948863d_h", o: "l", at: "12:15", c: "costume" },
  { t: "65535/55624061059_b6ca0da460", f: "65535/55624061059_4c8d7f567d_h", o: "l", at: "12:17", c: "costume" },
  { t: "65535/55623990158_1bbb1d2c6d", f: "65535/55623990158_41e928adef_h", o: "p", at: "12:17", c: "costume" },
  { t: "65535/55623990113_e5660b2ca4", f: "65535/55623990113_be99ec1567_h", o: "p", at: "12:18", c: "costume" },
  { t: "65535/55622851832_a9c6abae90", f: "65535/55622851832_accd42bb66_h", o: "p", at: "12:18", c: "costume" },
  { t: "65535/55623851481_16836e5dd7", f: "65535/55623851481_427fba6eeb_h", o: "p", at: "12:24", c: "costume" },
  { t: "65535/55624061169_6aa7444e28", f: "65535/55624061169_dde3a31f70_h", o: "p", at: "12:24", c: "costume" },
  { t: "65535/55624275810_23f67be6ec", f: "65535/55624275810_42c268e934_h", o: "p", at: "12:25", c: "costume" },
  { t: "65535/55624275735_45d034f1f3", f: "65535/55624275735_10ce023688_h", o: "p", at: "12:28", c: "costume" },
  { t: "65535/55623990163_74413184c5", f: "65535/55623990163_1d4b4319bf_h", o: "p", at: "12:28", c: "costume" },
  { t: "65535/55622851652_69b0b8d5ef", f: "65535/55622851652_6351e81b91_h", o: "l", at: "12:31", c: "costume" },
  { t: "65535/55624060644_400193efc7", f: "65535/55624060644_7a5ab2fac5_h", o: "l", at: "12:31", c: "costume" },
  { t: "65535/55623989798_09eede974c", f: "65535/55623989798_8fe8f4cc70_h", o: "l", at: "12:31", c: "costume" },
  { t: "65535/55623989718_3243c26719", f: "65535/55623989718_ef78773df7_h", o: "l", at: "12:31", c: "costume" },
  { t: "65535/55623851071_7dbcc05699", f: "65535/55623851071_479687347c_h", o: "p", at: "12:32", c: "costume" },
  { t: "65535/55623850986_8c1f560e6f", f: "65535/55623850986_9a2e467b85_h", o: "p", at: "12:33", c: "costume" },
  { t: "65535/55624275440_e39939a4c2", f: "65535/55624275440_67e8b708d0_h", o: "p", at: "12:33", c: "costume" },
  { t: "65535/55623851316_0ea09fd507", f: "65535/55623851316_ace07eae6b_h", o: "p", at: "12:33", c: "costume" },
  { t: "65535/55624275605_179b5e3f0b", f: "65535/55624275605_14d458a409_h", o: "p", at: "12:33", c: "costume" },
  { t: "65535/55623989518_98b8e8986c", f: "65535/55623989518_718681ac44_h", o: "p", at: "12:33", c: "costume" },
  { t: "65535/55622851262_7e9ff42bc0", f: "65535/55622851262_d90c664abd_h", o: "p", at: "12:33", c: "costume" },
  { t: "65535/55624060129_163cf1e5d6", f: "65535/55624060129_26d89b664d_h", o: "p", at: "12:34", c: "costume" },
  { t: "65535/55622851042_2872d70a81", f: "65535/55622851042_2a18b2fd54_h", o: "p", at: "12:34", c: "costume" },
  { t: "65535/55624059989_1d9721a3b8", f: "65535/55624059989_e06f52f84a_h", o: "p", at: "12:34", c: "costume" },
  { t: "65535/55624274940_83a1b892cd", f: "65535/55624274940_13bd14c81f_h", o: "p", at: "12:35", c: "costume" },
  { t: "65535/55623850766_a89c053974", f: "65535/55623850766_9bd9432cba_h", o: "p", at: "12:35", c: "costume" },
  { t: "65535/55624274815_62d533d952", f: "65535/55624274815_020fa14f40_h", o: "p", at: "12:35", c: "costume" },
  { t: "65535/55624271705_04ed3d7d0f", f: "65535/55624271705_9ecd1ac9cd_h", o: "p", at: "12:35", c: "costume" },
  { t: "65535/55622848152_ec8bc1d70f", f: "65535/55622848152_bc3d265758_h", o: "l", at: "12:36", c: "pilates" },
  { t: "65535/55623989028_6f7ac1df63", f: "65535/55623989028_c129b6ea61_h", o: "l", at: "12:36", c: "pilates" },
  { t: "65535/55623850661_2ecae643a1", f: "65535/55623850661_ce9f2fc2ae_h", o: "l", at: "12:36", c: "pilates" },
  { t: "65535/55624274650_32dff9e089", f: "65535/55624274650_5231a69057_h", o: "l", at: "12:37", c: "pilates" },
  { t: "65535/55622850717_1988d3e80e", f: "65535/55622850717_45d51328e3_h", o: "p", at: "12:37", c: "pilates" },
  { t: "65535/55623988748_920abd335f", f: "65535/55623988748_407cdaeac9_h", o: "p", at: "12:37", c: "pilates" },
  { t: "65535/55622850597_8e92de0697", f: "65535/55622850597_b1b9c288bf_h", o: "p", at: "12:38", c: "banda" },
  { t: "65535/55623988908_8a2d2a7f36", f: "65535/55623988908_fdde8c7abe_h", o: "l", at: "12:38", c: "banda" },
  { t: "65535/55624274395_b1ec16da9f", f: "65535/55624274395_058fefa514_h", o: "l", at: "12:38", c: "banda" },
  { t: "65535/55624274400_f757fca588", f: "65535/55624274400_71f5443256_h", o: "l", at: "12:38", c: "banda" },
  { t: "65535/55623850121_95849cf77a", f: "65535/55623850121_c77adbd3b4_h", o: "l", at: "12:40", c: "pilates" },
  { t: "65535/55623988513_c03e9c60cd", f: "65535/55623988513_a6f9a84b12_h", o: "p", at: "12:41", c: "pilates" },
  { t: "65535/55623849851_40313b5daa", f: "65535/55623849851_cf2f61dc2b_h", o: "l", at: "12:42", c: "pilates" },
  { t: "65535/55624274185_e509ede53e", f: "65535/55624274185_a1e74308cd_h", o: "l", at: "12:42", c: "pilates" },
  { t: "65535/55623988373_ab881f8996", f: "65535/55623988373_2ade129155_h", o: "p", at: "12:43", c: "pilates" },
  { t: "65535/55623988563_ea4e5fdcb8", f: "65535/55623988563_01507319e9_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55624059264_7da3e83282", f: "65535/55624059264_469bdf8479_h", o: "p", at: "12:43", c: "costume" },
  { t: "65535/55622850137_641b694dd9", f: "65535/55622850137_1e24157576_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55624273975_a28305d7e2", f: "65535/55624273975_2b83963a63_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55624273860_ee1146ee2c", f: "65535/55624273860_46c7da3535_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55623849576_e0795f45e0", f: "65535/55623849576_f13d4dc65c_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55624059074_36da49071e", f: "65535/55624059074_225fb95956_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55624273910_8943bab65f", f: "65535/55624273910_6a4923a84d_h", o: "l", at: "12:43", c: "pilates" },
  { t: "65535/55623849506_7ae0a2ab94", f: "65535/55623849506_ec280f2da6_h", o: "l", at: "12:45", c: "pilates" },
  { t: "65535/55623987998_370b218d90", f: "65535/55623987998_6d4d4ccbd0_h", o: "l", at: "12:45", c: "pilates" },
  { t: "65535/55623987868_1798b8b30c", f: "65535/55623987868_32dc31d2b1_h", o: "l", at: "12:46", c: "pilates" },
  { t: "65535/55623987848_194fbef2fb", f: "65535/55623987848_a033e4da66_h", o: "l", at: "12:46", c: "ofrendas" },
  { t: "65535/55624058484_d52357c50c", f: "65535/55624058484_cae37b3be7_h", o: "p", at: "12:46", c: "ofrendas" },
  { t: "65535/55623987673_8655d95076", f: "65535/55623987673_eca8d2e66c_h", o: "p", at: "12:46", c: "ofrendas" },
  { t: "65535/55624273655_a1512a2902", f: "65535/55624273655_b62eee0704_h", o: "p", at: "12:46", c: "ofrendas" },
  { t: "65535/55623849346_db01e0371d", f: "65535/55623849346_dabef902e0_h", o: "l", at: "12:47", c: "pilates" },
  { t: "65535/55622849482_db2266db1f", f: "65535/55622849482_246c7dac5b_h", o: "l", at: "12:47", c: "pilates" },
  { t: "65535/55624273240_27c4543276", f: "65535/55624273240_afcc347f73_h", o: "l", at: "12:47", c: "pilates" },
  { t: "65535/55624058184_d4cafb9ffd", f: "65535/55624058184_7cce786ff2_h", o: "l", at: "12:47", c: "pilates" },
  { t: "65535/55623987358_ca25208770", f: "65535/55623987358_567de2b865_h", o: "l", at: "12:47", c: "pilates" },
  { t: "65535/55623987268_59fdeba8de", f: "65535/55623987268_a9723d2e9a_h", o: "l", at: "12:48", c: "pilates" },
  { t: "65535/55624058019_7f8e2756c2", f: "65535/55624058019_18919d28cb_h", o: "l", at: "12:48", c: "pilates" },
  { t: "65535/55624273195_628dd5a7c9", f: "65535/55624273195_e9b5dc5317_h", o: "l", at: "12:48", c: "pilates" },
  { t: "65535/55624058224_cfbd323a72", f: "65535/55624058224_0eb4e4a897_h", o: "l", at: "12:48", c: "banda" },
  { t: "65535/55622849202_dcd38319b2", f: "65535/55622849202_9d9a6431df_h", o: "l", at: "12:48", c: "banda" },
  { t: "65535/55624272735_2bbb87556c", f: "65535/55624272735_4314df4f77_h", o: "l", at: "12:48", c: "banda" },
  { t: "65535/55622849067_1b9aec31d9", f: "65535/55622849067_90e8cfdc69_h", o: "p", at: "12:50", c: "costume" },
  { t: "65535/55623986898_67e4d74317", f: "65535/55623986898_6fdccbf11b_h", o: "p", at: "12:50", c: "costume" },
  { t: "65535/55622848952_b3dc8f2c66", f: "65535/55622848952_3e2cea7aa2_h", o: "p", at: "12:51", c: "costume" },
  { t: "65535/55622848942_0f1bc34711", f: "65535/55622848942_c808d47951_h", o: "p", at: "12:51", c: "costume" },
  { t: "65535/55624272445_988b57a0b9", f: "65535/55624272445_a02d4a5029_h", o: "p", at: "12:52", c: "costume" },
  { t: "65535/55623986648_acaf8a1ee9", f: "65535/55623986648_e1e4e2c1de_h", o: "l", at: "12:57", c: "costume" },
  { t: "65535/55623847926_256823f22e", f: "65535/55623847926_49f37bbc9a_h", o: "l", at: "12:57", c: "costume" },
  { t: "65535/55623986408_f2383b8a6f", f: "65535/55623986408_0e15b6067e_h", o: "p", at: "13:02", c: "pilates" },
  { t: "65535/55624272650_3c1485c998", f: "65535/55624272650_65b7339905_h", o: "p", at: "13:02", c: "pilates" },
  { t: "65535/55624057849_d529708123", f: "65535/55624057849_c602bf277c_h", o: "p", at: "13:02", c: "pilates" },
  { t: "65535/55623985928_8a42cb155f", f: "65535/55623985928_d143bc13fa_h", o: "p", at: "13:02", c: "pilates" },
  { t: "65535/55624271605_5196cd8acf", f: "65535/55624271605_45965a0768_h", o: "p", at: "13:02", c: "pilates" },
];

// The Sunday slot. See ADDING THE SUNDAY ALBUM at the top of this file.
export const ddlmSundayPhotos = [];

export const ddlmHasSundayPhotos = ddlmSundayPhotos.length > 0;
export const ddlmPhotoCount =
  ddlmMakingPhotos.length + ddlmSaturdayPhotos.length + ddlmSundayPhotos.length;
