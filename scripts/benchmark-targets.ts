export type BenchmarkTarget = {
  category: string;
  url: string;
  gate?: boolean;
  gateReason?: string;
  excludeLikelyBoilerplate?: boolean;
  maxChildrenPerNode?: number;
  maxLinkFarmChildren?: number;
};

export const koreaSocialTargets: BenchmarkTarget[] = [
  {
    category: "Clien home",
    url: "https://www.clien.net/service/",
  },
  {
    category: "Clien post",
    url: "https://www.clien.net/service/board/park/19204340",
  },
  {
    category: "Ruliweb post",
    url: "https://bbs.ruliweb.com/community/board/300143/read/69070439",
  },
  {
    category: "DCInside post",
    url: "https://gall.dcinside.com/board/view/?id=programming&no=748652",
  },
  {
    category: "Google search",
    url: "https://www.google.com/search?q=ax-lite",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as diagnostics only.",
  },
  {
    category: "Bing search",
    url: "https://www.bing.com/search?q=ax-lite",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as diagnostics only.",
  },
  {
    category: "Startpage search",
    url: "https://www.startpage.com/sp/search?query=ax-lite",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as diagnostics only.",
  },
  {
    category: "X social",
    url: "https://x.com/NASA",
    gate: false,
    gateReason: "Social pages are login, hydration, and personalization sensitive; keep as diagnostics only.",
  },
  {
    category: "Instagram social",
    url: "https://www.instagram.com/nasa/",
    gate: false,
    gateReason: "Social pages are login, hydration, and personalization sensitive; keep as diagnostics only.",
  },
];

export const chinaJapanTargets: BenchmarkTarget[] = [
  {
    category: "China Wikipedia",
    url: "https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%9B%BD",
  },
  {
    category: "People China portal",
    url: "http://www.people.com.cn/",
    gate: false,
    gateReason: "The page fetches, but agent-browser reference navigation is blocked in this environment; keep as diagnostics only.",
  },
  {
    category: "Xinhua portal",
    url: "https://www.news.cn/",
  },
  {
    category: "Douban home",
    url: "https://www.douban.com/",
  },
  {
    category: "Baidu search",
    url: "https://www.baidu.com/s?wd=ax-lite",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as diagnostics only.",
  },
  {
    category: "Bilibili home",
    url: "https://www.bilibili.com/",
    gate: false,
    gateReason: "Video and social pages are hydration, personalization, and regional-state sensitive; keep as diagnostics only.",
  },
  {
    category: "Japan Wikipedia",
    url: "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC",
  },
  {
    category: "NHK News",
    url: "https://www3.nhk.or.jp/news/",
    gate: false,
    gateReason: "The page fetches, but agent-browser reference navigation fails in this environment; keep as diagnostics only.",
  },
  {
    category: "Qiita TypeScript tag",
    url: "https://qiita.com/tags/typescript",
  },
  {
    category: "Hatena IT hotentry",
    url: "https://b.hatena.ne.jp/hotentry/it",
  },
  {
    category: "5ch board",
    url: "https://itest.5ch.net/subback/poverty",
  },
  {
    category: "Yahoo Japan search",
    url: "https://search.yahoo.co.jp/search?p=ax-lite",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as diagnostics only.",
  },
  {
    category: "Niconico home",
    url: "https://www.nicovideo.jp/",
    gate: false,
    gateReason: "Video and social pages are hydration, personalization, and regional-state sensitive; keep as diagnostics only.",
  },
];

export function resolveBenchmarkTargets(args: string[], fallback: string[]): BenchmarkTarget[] {
  const targetSetIndex = args.indexOf("--target-set");
  if (targetSetIndex >= 0) {
    const name = args[targetSetIndex + 1];
    if (name === "korea-social") return koreaSocialTargets;
    if (name === "china-japan") return chinaJapanTargets;
    throw new Error(`Unknown target set: ${name ?? ""}`);
  }

  const urls = args.filter((arg, index) => {
    if (arg === "--target-set") return false;
    if (args[index - 1] === "--target-set") return false;
    return true;
  });
  return (urls.length > 0 ? urls : fallback).map((url) => ({ category: "Custom", url }));
}
