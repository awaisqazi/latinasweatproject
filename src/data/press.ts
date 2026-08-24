export interface PressArticle {
  outlet: string;
  title: string;
  url: string;
  snippet: string;
  isVideo?: boolean;
  isInternal?: boolean;
  ctaLabel?: string;
  /** Featured coverage gets a hero treatment on /press, the homepage press
   *  section, and the links page. */
  featured?: boolean;
  /** Outlet wordmark (public path, without base). */
  logo?: string;
  /** Lead photo (public path, without base) + alt text. */
  image?: string;
  imageAlt?: string;
  /** Byline + date line shown on featured layouts. */
  byline?: string;
  /** A pull quote from the piece. */
  quote?: string;
  quoteAttribution?: string;
}

export const pressArticles: PressArticle[] = [
  {
    outlet: "Chicago Reader",
    title: "Más allá del estudio",
    url: "https://chicagoreader.com/city-life/latina-sweat-project-yoga-teacher-graduation/",
    snippet:
      "The Chicago Reader spends graduation night at our Pilsen studio as 85 new yoga teachers from the 2025 and 2026 cohorts are celebrated: full scholarships, monarch butterflies, candlelight, and a community that, in Margarita's words, was never these walls and never an address.",
    featured: true,
    logo: "/images/press/chicago-reader-logo.png",
    image: "/images/press/reader-graduation-2026.jpg",
    imageAlt:
      "Two graduates embrace as the room applauds at the 2026 yoga teacher training graduation at LSP Studio in Pilsen",
    byline: "By Leslie Hurtado · August 21, 2026",
    quote:
      "Latina Sweat Project was never these walls. It was never an address. It has always been the people standing in this room.",
    quoteAttribution: "Margarita Quiñones-Peña, Founder",
    ctaLabel: "Read the Story",
  },
  {
    outlet: "WGN9 Chicago (Around Town)",
    title: "Around Town checks out The Latina Sweat Project",
    url: "/wgn9-around-town",
    snippet:
      "WGN9's Ana Belaval visits the studio for a four-part Around Town feature, sampling our Spanish yoga flow, talking with members Rut and Veronica about our community art gallery, trying the workout, and sitting down with founder Margarita to hear the story behind LSP.",
    isVideo: true,
    isInternal: true,
    ctaLabel: "Watch the Feature",
  },
  {
    outlet: "Negocios Now",
    title: "Margarita Quiñones Peña: 40 Under 40: Advocate for Holistic Community Empowerment",
    url: "https://negociosnow.com/margarita-quinones-pena-advocate-for-holistic-community-empowerment/",
    snippet:
      "Negocios Now names LSP founder Margarita Quiñones Peña to their 40 Under 40 list, recognizing her work building a grassroots wellness movement rooted in Pilsen that reaches over 250,000 participants yearly through trauma-informed yoga and culturally grounded programming.",
  },
  {
    outlet: "Chicago Reader",
    title: "Best Latina-owned inclusive wellness studio building strength together",
    url: "https://chicagoreader.com/best-of-chicago/the-latina-sweat-project/",
    snippet:
      "Named Best of Chicago 2025 in Sports & Recreation, the Chicago Reader celebrates The Latina Sweat Project as a place where workout classes feel like they're led by actual friends — building community and strength together.",
  },
  {
    outlet: "NBC Chicago & Telemundo Chicago",
    title: "NBC 5 and Telemundo Chicago to celebrate Women's History Month",
    url: "https://www.nbcchicago.com/news/local/nbc-5-and-telemundo-chicago-to-celebrate-womens-history-month-with-new-series/3902622/",
    snippet:
      "NBC 5 and Telemundo Chicago feature The Latina Sweat Project as part of their Women's History Month programming, highlighting women making a difference in their communities.",
  },
  {
    outlet: "WGN TV (Daytime Chicago)",
    title: "The Latina Sweat Project: Making yoga accessible to all",
    url: "https://wgntv.com/daytime-chicago/the-latina-sweat-project-making-yoga-accessible-to-all/",
    snippet:
      "Daytime Chicago features The Latina Sweat Project's mission to break barriers and make yoga and wellness accessible to everyone, regardless of background.",
    isVideo: true,
  },
  {
    outlet: "CBS News Chicago",
    title: "Chicago businesses join 'ICE Out' strike day opposing immigration crackdown",
    url: "https://www.cbsnews.com/chicago/news/general-strike-ice-out-chicago-business-donations/",
    snippet:
      "CBS News Chicago highlights how The Latina Sweat Project opened its doors as a sanctuary for the community, offering all classes for free in solidarity during the nationwide ICE Out strike.",
  },
];
