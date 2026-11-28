// Instructor portal: validator for the content document, schema 1.
// Contract: ./README.md ("Content document (schema 1)").
//
// Hand-rolled and dependency free, so scripts/instructor-portal.mjs can run it
// in Node and the page can run it in the browser.
//
// Top-level sections are optional (the page renders a missing section as empty),
// but a section that is present must be well formed. Inside an item, every field
// the README writes without "?" is required.
//
// validateContent(doc) -> { ok, errors: string[], warnings: string[] }
// Each error is "path: message", for example "faq[3].id: duplicate id \"pay\"".

import { safeHref, isDateString } from "./richText.js";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINK_IN_TEXT = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BLOCK_TYPES = new Set(["p", "h", "ul", "ol"]);

const TOP_KEYS = new Set([
  "schema", "updated", "period", "week", "dates", "actions", "handbook", "faq",
  "contacts", "volunteer", "committees", "fundraising", "coordinators", "links",
]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function validateContent(doc) {
  const errors = [];
  const warnings = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  // --- field helpers -------------------------------------------------------
  // A blank display string is a warning (hand-edited documents leave some on
  // purpose); a blank date, link or id is an error, via `strict`.
  function str(obj, key, path, { optional = false, strict = false } = {}) {
    const v = obj[key];
    const p = `${path}.${key}`;
    if (v === undefined || v === null) {
      if (!optional) err(p, "is required");
      return false;
    }
    if (typeof v !== "string") return err(p, "must be a string"), false;
    if (!v.trim()) {
      if (strict) err(p, "must not be empty");
      else warnings.push(`${p}: is empty, so the page shows nothing there`);
      return false;
    }
    return true;
  }
  function date(obj, key, path, opts) {
    if (!str(obj, key, path, { ...opts, strict: true })) return false;
    if (!isDateString(obj[key])) return err(`${path}.${key}`, `must be a real date written YYYY-MM-DD (got "${obj[key]}")`), false;
    return true;
  }
  function href(obj, key, path, opts) {
    if (!str(obj, key, path, { ...opts, strict: true })) return;
    if (!safeHref(obj[key])) {
      err(`${path}.${key}`, `unsafe or unsupported link "${obj[key]}" (use /path, https:, mailto: or tel:)`);
    }
  }
  function bool(obj, key, path) {
    if (obj[key] !== undefined && typeof obj[key] !== "boolean") err(`${path}.${key}`, "must be true or false");
  }
  function strList(obj, key, path, { optional = false, check } = {}) {
    const v = obj[key];
    const p = `${path}.${key}`;
    if (v === undefined || v === null) {
      if (!optional) err(p, "is required");
      return;
    }
    if (!Array.isArray(v)) return err(p, "must be an array of strings");
    v.forEach((item, i) => {
      if (typeof item !== "string" || !item.trim()) err(`${p}[${i}]`, "must be a non-empty string");
      else if (check) check(item, `${p}[${i}]`);
    });
  }
  function list(obj, key, path, each, { optional = true } = {}) {
    const v = obj[key];
    const p = `${path}.${key}`;
    if (v === undefined || v === null) {
      if (!optional) err(p, "is required");
      return [];
    }
    if (!Array.isArray(v)) return err(p, "must be an array"), [];
    v.forEach((item, i) => {
      if (!isObj(item)) err(`${p}[${i}]`, "must be an object");
      else each(item, `${p}[${i}]`);
    });
    return v;
  }
  function section(obj, key, path, each, { optional = true } = {}) {
    const v = obj[key];
    const p = `${path}.${key}`;
    if (v === undefined || v === null) {
      if (!optional) err(p, "is required");
      return;
    }
    if (!isObj(v)) return err(p, "must be an object");
    each(v, p);
  }
  function blocks(obj, key, path, { optional = false } = {}) {
    list(obj, key, path, (b, p) => {
      if (!BLOCK_TYPES.has(b.t)) return err(`${p}.t`, `must be one of p, h, ul, ol (got ${JSON.stringify(b.t)})`);
      if (b.t === "p" || b.t === "h") str(b, "x", p);
      else {
        strList(b, "items", p);
        if (Array.isArray(b.items) && b.items.length === 0) err(`${p}.items`, "must not be empty");
      }
    }, { optional });
  }
  function emails(obj, key, path, opts) {
    strList(obj, key, path, { ...opts, check: (v, p) => { if (!EMAIL.test(v.trim())) err(p, `does not look like an email address ("${v}")`); } });
  }
  // Contact phones: each entry is a number string, or { label, number } when a
  // row lists more than one person ("Call or text <label>"). A number needs at
  // least 7 digits; a label must be a non-empty string.
  function phones(obj, key, path) {
    const v = obj[key];
    const p = `${path}.${key}`;
    if (v === undefined || v === null) return err(p, "is required");
    if (!Array.isArray(v)) return err(p, "must be an array of numbers or { label, number } objects");
    const digits = (n) => n.replace(/\D/g, "").length;
    v.forEach((item, i) => {
      const ip = `${p}[${i}]`;
      if (typeof item === "string") {
        if (!item.trim()) err(ip, "must be a non-empty string");
        else if (digits(item) < 7) err(ip, `must contain at least 7 digits ("${item}")`);
      } else if (isObj(item)) {
        if (typeof item.label !== "string" || !item.label.trim()) err(`${ip}.label`, "must be a non-empty string");
        if (typeof item.number !== "string" || !item.number.trim()) err(`${ip}.number`, "must be a non-empty string");
        else if (digits(item.number) < 7) err(`${ip}.number`, `must contain at least 7 digits ("${item.number}")`);
      } else {
        err(ip, "must be a number string or a { label, number } object");
      }
    });
  }
  function uniqueIds(items, path, label) {
    const seen = new Map();
    items.forEach((item, i) => {
      if (!isObj(item)) return;
      const id = item.id;
      const p = `${path}[${i}].id`;
      if (typeof id !== "string" || !id) return err(p, "is required");
      if (!KEBAB.test(id)) err(p, `must be kebab-case, lowercase letters, digits and dashes (got "${id}")`);
      if (seen.has(id)) err(p, `duplicate ${label} id "${id}" (also ${path}[${seen.get(id)}])`);
      else seen.set(id, i);
    });
  }

  // --- document ------------------------------------------------------------
  if (!isObj(doc)) {
    return { ok: false, errors: ["(root): must be a JSON object"], warnings };
  }

  const R = "content";
  if (doc.schema !== 1) err(`${R}.schema`, `must be the number 1 (got ${JSON.stringify(doc.schema)})`);
  date(doc, "updated", R);

  for (const key of Object.keys(doc)) {
    if (!TOP_KEYS.has(key)) warnings.push(`${R}.${key}: unknown key, the page ignores it`);
  }

  section(doc, "period", R, (o, p) => {
    str(o, "label", p);
    const a = date(o, "start", p);
    const b = date(o, "end", p);
    if (a && b && o.start > o.end) err(`${p}.end`, "is before start");
  });

  list(doc, "week", R, (o, p) => {
    const a = date(o, "start", p);
    const b = date(o, "end", p);
    if (a && b && o.start > o.end) err(`${p}.end`, "is before start");
    str(o, "headline", p);
    blocks(o, "notes", p, { optional: true });
    strList(o, "shoutouts", p, { optional: true });
  });

  list(doc, "dates", R, (o, p) => {
    const a = date(o, "date", p);
    const b = date(o, "end", p, { optional: true });
    if (a && b && o.date > o.end) err(`${p}.end`, "is before date");
    str(o, "time", p, { optional: true });
    str(o, "title", p);
    str(o, "text", p, { optional: true });
    href(o, "href", p, { optional: true });
    str(o, "cta", p, { optional: true });
  });

  const actions = list(doc, "actions", R, (o, p) => {
    str(o, "id", p, { strict: true });
    str(o, "label", p);
    str(o, "text", p);
    href(o, "href", p);
  });
  if (actions.length) {
    const seen = new Map();
    actions.forEach((o, i) => {
      if (!isObj(o) || typeof o.id !== "string") return;
      if (seen.has(o.id)) err(`${R}.actions[${i}].id`, `duplicate action id "${o.id}" (also ${R}.actions[${seen.get(o.id)}])`);
      else seen.set(o.id, i);
    });
  }

  section(doc, "handbook", R, (o, p) => {
    str(o, "title", p);
    str(o, "version", p);
    str(o, "effective", p);
    str(o, "appliesTo", p);
    str(o, "note", p, { optional: true });
    section(o, "original", p, (x, xp) => {
      str(x, "label", xp);
      href(x, "href", xp);
      str(x, "access", xp, { optional: true });
    });
    const sections = list(o, "sections", p, (s, sp) => {
      str(s, "title", sp);
      blocks(s, "blocks", sp);
    }, { optional: false });
    uniqueIds(sections, `${p}.sections`, "section");
  });

  const faq = list(doc, "faq", R, (o, p) => {
    str(o, "group", p);
    str(o, "q", p);
    blocks(o, "a", p);
    bool(o, "pending", p);
    str(o, "source", p, { optional: true });
    section(o, "ask", p, (x, xp) => {
      str(x, "who", xp);
      if (str(x, "email", xp, { optional: true }) && !EMAIL.test(x.email.trim())) {
        err(`${xp}.email`, `does not look like an email address ("${x.email}")`);
      }
      str(x, "phone", xp, { optional: true });
    });
  });
  uniqueIds(faq, `${R}.faq`, "faq");

  list(doc, "contacts", R, (o, p) => {
    str(o, "area", p);
    str(o, "for", p);
    str(o, "who", p);
    emails(o, "emails", p);
    phones(o, "phones", p);
  });

  list(doc, "volunteer", R, (o, p) => {
    str(o, "title", p);
    str(o, "when", p, { optional: true }); // an open-ended ask has no date
    str(o, "text", p);
    href(o, "href", p);
    str(o, "cta", p);
    date(o, "until", p, { optional: true });
  });

  section(doc, "committees", R, (o, p) => {
    blocks(o, "text", p);
    href(o, "href", p);
    str(o, "cta", p);
  });

  section(doc, "fundraising", R, (o, p) => {
    blocks(o, "text", p);
    list(o, "links", p, (x, xp) => {
      str(x, "label", xp);
      str(x, "text", xp);
      href(x, "href", xp);
    }, { optional: false });
    section(o, "contact", p, (x, xp) => {
      str(x, "who", xp);
      emails(x, "emails", xp);
    });
  });

  section(doc, "coordinators", R, (o, p) => {
    blocks(o, "intro", p);
    section(o, "schedule", p, (s, sp) => {
      str(s, "label", sp);
      strList(s, "days", sp);
      const days = Array.isArray(s.days) ? s.days.length : null;
      list(s, "rows", sp, (r, rp) => {
        str(r, "time", rp);
        if (!Array.isArray(r.who)) return err(`${rp}.who`, "must be an array of strings, one per day");
        r.who.forEach((w, i) => {
          if (typeof w !== "string") err(`${rp}.who[${i}]`, "must be a string (use \"\" for an empty slot)");
        });
        if (days !== null && r.who.length !== days) {
          err(`${rp}.who`, `has ${r.who.length} entries but days has ${days}`);
        }
      }, { optional: false });
      list(s, "weekend", sp, (w, wp) => {
        str(w, "day", wp);
        str(w, "time", wp);
        str(w, "who", wp);
      });
      str(s, "note", sp, { optional: true });
    });
    list(o, "tools", p, (t, tp) => {
      str(t, "label", tp);
      str(t, "text", tp);
      href(t, "href", tp);
    });
    list(o, "todos", p, (t, tp) => {
      str(t, "title", tp);
      strList(t, "items", tp);
      bool(t, "pending", tp);
      str(t, "note", tp, { optional: true });
    });
    section(o, "find", p, (f, fp) => {
      list(f, "items", fp, (x, xp) => {
        str(x, "what", xp);
        str(x, "where", xp);
      }, { optional: false });
      bool(f, "pending", fp);
      str(f, "note", fp, { optional: true });
    });
  });

  list(doc, "links", R, (o, p) => {
    str(o, "label", p);
    str(o, "text", p, { optional: true });
    href(o, "href", p);
  });

  // Every [label](url) in every string anywhere in the document.
  walkStrings(doc, R, (s, p) => {
    LINK_IN_TEXT.lastIndex = 0;
    for (let m = LINK_IN_TEXT.exec(s); m; m = LINK_IN_TEXT.exec(s)) {
      if (!safeHref(m[2])) err(p, `unsafe or unsupported link "${m[2]}" in [${m[1]}](...) (it would render as plain text)`);
    }
    if (/<\s*\/?\s*[a-z][^>]*>/i.test(s)) warnings.push(`${p}: looks like HTML, which is shown as literal text`);
  });

  return { ok: errors.length === 0, errors, warnings };
}

function walkStrings(v, path, fn) {
  if (typeof v === "string") fn(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, `${path}[${i}]`, fn));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) walkStrings(x, `${path}.${k}`, fn);
}
