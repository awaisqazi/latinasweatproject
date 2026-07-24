// Sweat Fest '26 poster art, drawn as SVG in the retro-rainbow identity from
// the 2026 Canva kit: sky over a '70s rainbow arch, Cubao bubble wordmark
// with chocolate outlines, butter info badges, daisies, sparkles, and a
// music note. Shared by SweatFestArtwork.astro (live site) and the social
// image render script (scripts/render-sweatfest-social.mjs) so the flyer only
// exists in one place. Every fact renders from sweatFest.js.
import { sweatFestPalette as p } from "./sweatFest.js";

// --- Motif builders -------------------------------------------------------

// '70s rainbow dome: chocolate rule, then green / pink / orange bands over a
// cream interior. cx/cy is the arch center on the horizon line.
const dome = (cx, cy) =>
  `
  <path d="M ${cx - 445} ${cy} A 445 445 0 0 1 ${cx + 445} ${cy}" fill="none" stroke="${p.chocolate}" stroke-width="10"/>
  <path d="M ${cx - 423} ${cy} A 423 423 0 0 1 ${cx + 423} ${cy}" fill="none" stroke="${p.green}" stroke-width="34"/>
  <path d="M ${cx - 389} ${cy} A 389 389 0 0 1 ${cx + 389} ${cy}" fill="none" stroke="${p.pink}" stroke-width="34"/>
  <path d="M ${cx - 355} ${cy} A 355 355 0 0 1 ${cx + 355} ${cy}" fill="none" stroke="${p.orange}" stroke-width="34"/>
  <circle cx="${cx}" cy="${cy}" r="339" fill="${p.cream}"/>
  `;

const daisy = (x, y, s, center = p.pink) => {
  const petals = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    return `<ellipse cx="${Math.cos(a) * 13}" cy="${Math.sin(a) * 13}" rx="9" ry="5.5" fill="#fdf8ec" stroke="${p.chocolate}" stroke-width="1.6" transform="rotate(${i * 45} ${Math.cos(a) * 13} ${Math.sin(a) * 13})"/>`;
  }).join("");
  return `<g transform="translate(${x} ${y}) scale(${s})">${petals}<circle r="6.5" fill="${center}" stroke="${p.chocolate}" stroke-width="1.6"/></g>`;
};

const sparkle = (x, y, s, fill = p.blue) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -14 C 2 -4 4 -2 14 0 C 4 2 2 4 0 14 C -2 4 -4 2 -14 0 C -4 -2 -2 -4 0 -14 Z" fill="${fill}" stroke="${p.chocolate}" stroke-width="1.4"/>`;

const note = (x, y, s) =>
  `<g transform="translate(${x} ${y}) scale(${s})" stroke="${p.chocolate}" stroke-width="2">
    <path d="M8 -26 L26 -30 L26 4" fill="none"/>
    <path d="M8 -26 L8 8" fill="none"/>
    <ellipse cx="2" cy="9" rx="7" ry="5.5" fill="${p.green}"/>
    <ellipse cx="20" cy="5" rx="7" ry="5.5" fill="${p.blue}"/>
  </g>`;

// Butter info badge with an icon coin on top and two lines of Anton type.
const badgeIcons = {
  calendar: (fill) =>
    `<circle r="21" fill="${fill}" stroke="${p.chocolate}" stroke-width="4"/>
     <g stroke="#fdf8ec" stroke-width="2.6" fill="none">
       <rect x="-9" y="-7" width="18" height="15" rx="2"/>
       <path d="M-9 -2 H9 M-4.5 -11 V-7 M4.5 -11 V-7"/>
     </g>`,
  pin: (fill) =>
    `<circle r="21" fill="${fill}" stroke="${p.chocolate}" stroke-width="4"/>
     <path d="M0 9 C -8 -1 -9 -3 -9 -7 a 9 9 0 1 1 18 0 c 0 4 -1 6 -9 16 Z" fill="#fdf8ec" transform="translate(0 -3)"/>
     <circle cy="-9.5" r="3.6" fill="${fill}"/>`,
  clock: (fill) =>
    `<circle r="21" fill="${fill}" stroke="${p.chocolate}" stroke-width="4"/>
     <circle r="11" fill="#fdf8ec"/>
     <path d="M0 -6 V0 L5 3" stroke="${p.chocolate}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
};

const badge = (x, y, w, icon, iconFill, line1, line2) =>
  `
  <g>
    <rect x="${x - w / 2}" y="${y}" width="${w}" height="112" rx="20" fill="${p.butter}" stroke="${p.chocolate}" stroke-width="5"/>
    <g transform="translate(${x} ${y})">${badgeIcons[icon](iconFill)}</g>
    <text x="${x}" y="${y + 52}" text-anchor="middle" font-family="Anton, Rubik, sans-serif" font-size="23" letter-spacing="1" fill="${p.chocolate}">${line1}</text>
    <text x="${x}" y="${y + 86}" text-anchor="middle" font-family="Anton, Rubik, sans-serif" font-size="23" letter-spacing="1" fill="${p.chocolate}">${line2}</text>
  </g>
  `;

// The three flyer facts, kept in one place so every composition agrees.
const badgeRow = (positions, w = [212, 224, 212]) =>
  badge(positions[0], positions[3], w[0], "calendar", p.green, "AUGUST 22,", "2026") +
  badge(positions[1], positions[3], w[1], "pin", p.blue, "CHICAGO ·", "LOCATION SOON") +
  badge(positions[2], positions[3], w[2], "clock", p.pink, "7:00 AM –", "9:00 PM");

// Arched wordmark: SWEAT in cream, FEST '26 in tan + mustard, both riding
// upward arcs with chocolate outline and hard drop shadow. `ns` keeps SVG
// ids unique when several poster variants share a page.
const wordmark = (ns, cx, sweatY, festY) =>
  `
  <defs>
    <path id="sf-${ns}-arc-sweat" d="M ${cx - 360} ${sweatY} A 620 620 0 0 1 ${cx + 360} ${sweatY}" fill="none"/>
    <path id="sf-${ns}-arc-fest" d="M ${cx - 380} ${festY} A 660 660 0 0 1 ${cx + 380} ${festY}" fill="none"/>
    <filter id="sf-${ns}-choco-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="5" dy="6" stdDeviation="0" flood-color="${p.chocolate}" flood-opacity="0.9"/>
    </filter>
  </defs>
  <g filter="url(#sf-${ns}-choco-shadow)" stroke="${p.chocolate}" stroke-width="9" paint-order="stroke fill">
    <text font-family="'Cubao Free Wide', 'Cubao Free', Rubik, sans-serif" font-size="112" letter-spacing="5" fill="#fdf8ec">
      <textPath href="#sf-${ns}-arc-sweat" startOffset="50%" text-anchor="middle">SWEAT</textPath>
    </text>
    <text font-family="'Cubao Free Wide', 'Cubao Free', Rubik, sans-serif" font-size="106" letter-spacing="3" fill="${p.tan}">
      <textPath href="#sf-${ns}-arc-fest" startOffset="50%" text-anchor="middle">FEST<tspan fill="${p.mustard}">&#8217;26</tspan></textPath>
    </text>
  </g>
  `;

const taglineText = "A celebration of wellness, cultura, and connection.";

const tagline = (ns, cx, y, size = 27) =>
  `
  <defs>
    <path id="sf-${ns}-arc-tag" d="M ${cx - 395} ${y} A 900 900 0 0 1 ${cx + 395} ${y}" fill="none"/>
  </defs>
  <text font-family="Rubik, sans-serif" font-size="${size}" font-weight="700" fill="${p.chocolate}">
    <textPath href="#sf-${ns}-arc-tag" startOffset="50%" text-anchor="middle">${taglineText}</textPath>
  </text>
  `;

// --- Compositions ---------------------------------------------------------

export function buildPosterSvg(variant, logoHref) {
  if (variant === "portrait") {
    return `
<svg viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="800" height="1000" fill="${p.cream}"/>
  <rect width="800" height="470" fill="${p.sky}"/>
  ${dome(400, 470)}
  <g><rect x="348" y="78" width="104" height="104" rx="14" fill="#fdf8ec" stroke="${p.chocolate}" stroke-width="3"/><image href="${logoHref}" x="358" y="88" width="84" height="84"/></g>
  ${wordmark("p", 400, 330, 452)}
  ${tagline("p", 400, 548)}
  ${daisy(92, 415, 1.4)}
  ${daisy(700, 415, 1)}
  ${sparkle(688, 540, 1.15)}
  ${sparkle(652, 585, 0.7)}
  ${note(675, 250, 1.1)}
  ${badgeRow([150, 400, 650, 640])}
  <text x="400" y="852" text-anchor="middle" font-family="Rubik, sans-serif" font-size="26" font-weight="600" fill="${p.chocolate}">Tickets available on our website</text>
  <text x="400" y="890" text-anchor="middle" font-family="Rubik, sans-serif" font-size="23" font-weight="500" fill="${p.chocolate}" text-decoration="underline">latinasweatproject.com/sweatfest</text>
</svg>`;
  }

  if (variant === "square") {
    return `
<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="800" height="800" fill="${p.cream}"/>
  <rect width="800" height="450" fill="${p.sky}"/>
  ${dome(400, 450)}
  <g><rect x="352" y="66" width="96" height="96" rx="14" fill="#fdf8ec" stroke="${p.chocolate}" stroke-width="3"/><image href="${logoHref}" x="362" y="76" width="76" height="76"/></g>
  ${wordmark("s", 400, 305, 425)}
  ${tagline("s", 400, 520, 25)}
  ${daisy(112, 445, 1.25)}
  ${daisy(676, 352, 0.95)}
  ${sparkle(690, 505, 1.05)}
  ${note(592, 240, 1)}
  ${badgeRow([150, 400, 650, 600])}
</svg>`;
  }

  return `
<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="1600" height="900" fill="${p.cream}"/>
  <rect width="1600" height="480" fill="${p.sky}"/>
  ${dome(800, 480)}
  <g><rect x="748" y="95" width="104" height="104" rx="14" fill="#fdf8ec" stroke="${p.chocolate}" stroke-width="3"/><image href="${logoHref}" x="758" y="105" width="84" height="84"/></g>
  ${wordmark("l", 800, 345, 465)}
  ${tagline("l", 800, 560, 26)}
  ${daisy(420, 300, 1.35)}
  ${daisy(1195, 315, 1)}
  ${sparkle(1245, 420, 1.2)}
  ${sparkle(360, 430, 0.8)}
  ${note(1150, 200, 1.1)}
  ${badgeRow([438, 800, 1162, 640], [224, 236, 224])}
</svg>`;
}
