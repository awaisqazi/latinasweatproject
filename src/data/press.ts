export interface PressArticle {
  outlet: string;
  title: string;
  url: string;
  snippet: string;
  isVideo?: boolean;
}

export const pressArticles: PressArticle[] = [
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
