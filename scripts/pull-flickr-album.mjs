// Prints gallery rows for one album on the LSP photographer's Flickr account,
// in the format src/data/ddlmGallery2026.js expects:
//   { t: "<base stem>", f: "<_h stem>", o: "l|p", at: "HH:MM", c: "<chapter>" }
// The _h rendition has its own per-size secret, so `f` is stored whole. Paste
// the output into ddlmSundayPhotos (or any later album) and rebuild.
//
//   node scripts/pull-flickr-album.mjs <albumId> [chapterKey]
//
// The album page carries a public site key; no account or secret is needed.
const [albumId, chapter = "sunday"] = process.argv.slice(2);
const OWNER = "88623248@N07";
if (!albumId) {
  console.error("usage: node scripts/pull-flickr-album.mjs <albumId> [chapterKey]");
  process.exit(1);
}

const pageUrl = `https://www.flickr.com/photos/${OWNER}/albums/${albumId}`;
const html = await (await fetch(pageUrl, { headers: { "user-agent": "Mozilla/5.0" } })).text();
const key = html.match(/site_key\s*=\s*"([a-f0-9]+)"/)?.[1];
if (!key) throw new Error(`no site key found on ${pageUrl}`);

const stem = (url) => url.replace("https://live.staticflickr.com/", "").replace(/\.jpg$/, "");
const rows = [];
for (let page = 1, pages = 1; page <= pages; page++) {
  const q = new URLSearchParams({
    method: "flickr.photosets.getPhotos",
    api_key: key,
    photoset_id: albumId,
    user_id: OWNER,
    extras: "url_c,url_h,date_taken",
    per_page: "500",
    page: String(page),
    format: "json",
    nojsoncallback: "1",
  });
  const data = await (await fetch(`https://api.flickr.com/services/rest/?${q}`)).json();
  if (data.stat !== "ok") throw new Error(data.message || "flickr error");
  pages = data.photoset.pages;
  for (const p of data.photoset.photo) {
    if (!p.url_c) console.error(`warning: ${p.id} has no _c rendition`);
    const base = `${p.server}/${p.id}_${p.secret}`;
    const full = p.url_h ? stem(p.url_h) : `${base}_c`;
    const landscape = Number(p.width_c) >= Number(p.height_c);
    rows.push(
      `  { t: "${base}", f: "${full}", o: "${landscape ? "l" : "p"}", at: "${p.datetaken.slice(11, 16)}", c: "${chapter}" },`,
    );
  }
  console.error(`${data.photoset.title}: ${data.photoset.total} photos`);
  const days = new Set(data.photoset.photo.map((p) => p.datetaken.slice(0, 10)));
  console.error(`dates taken: ${[...days].sort().join(", ")}`);
}
console.log(rows.join("\n"));
