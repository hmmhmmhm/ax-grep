export type BenchmarkTarget = {
  category: string;
  url: string;
  html?: string;
  status?: number;
  findQueries?: string[];
  gate?: boolean;
  gateReason?: string;
  excludeLikelyBoilerplate?: boolean;
  maxChildrenPerNode?: number;
  maxLinkFarmChildren?: number;
};

const syntheticSearchHtml = `
  <main>
    <ol>
      <li class="b_algo">
        <h2><a href="https://docs.example/ax-grep">ax-grep agent guide</a></h2>
        <p>Practical guide for using ax-grep as an agent search and page checking tool.</p>
      </li>
      <li class="b_algo">
        <h2><a href="https://noise.example/post">Unrelated note</a></h2>
        <p>Background material that should not be selected first.</p>
      </li>
    </ol>
  </main>
`;

const syntheticSearchRefineHtml = `
  <main>
    <div class="b_algo">
      <h3><a href="https://target.example/first">Unrelated Baidu Result</a></h3>
      <p class="b_snippet">This result covers nearby background but not the requested phrase.</p>
    </div>
    <div class="b_algo">
      <h3><a href="https://target.example/second">Background source</a></h3>
      <p class="b_snippet">Another result that helps the agent choose an alternate result.</p>
    </div>
  </main>
`;

const syntheticSiteSearchHtml = `
  <main>
    <h1>Research archive</h1>
    <p>Search the archive before broadening to a web search.</p>
    <form method="GET" action="/find">
      <label for="archive-query">Archive search</label>
      <input id="archive-query" name="query" type="search" placeholder="Search reports">
      <button type="submit">Search</button>
    </form>
  </main>
`;

const syntheticActionTargetHtml = `
  <html>
    <head>
      <title>Action target report</title>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          "name": "Quarterly agent report",
          "potentialAction": [
            {
              "@type": "SearchAction",
              "name": "Search reports",
              "target": {
                "@type": "EntryPoint",
                "urlTemplate": "https://actions.example/reports?q={search_term_string}",
                "httpMethod": "GET"
              },
              "query-input": "required name=search_term_string"
            },
            {
              "@type": "DownloadAction",
              "name": "Download CSV",
              "target": {
                "@type": "EntryPoint",
                "url": "https://actions.example/report.csv",
                "encodingType": "text/csv"
              }
            }
          ]
        }
      </script>
    </head>
    <body>
      <main>
        <h1>Quarterly agent report</h1>
        <p>This page exposes structured action targets that are not visible as ordinary accessibility-tree controls.</p>
        <a href="https://actions.example/report-source">Source dataset</a>
      </main>
    </body>
  </html>
`;

const syntheticBlockedHtml = "";

const syntheticHiddenMetadataHtml = `
  <html>
    <head>
      <title>Hidden agent payload</title>
      <meta name="application-name" content="Agent Console">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="al:ios:url" content="agent-console://open/report">
      <meta name="citation_doi" content="10.5555/agent-check.2026">
      <meta http-equiv="permissions-policy" content="geolocation=()">
      <link rel="manifest" href="/app.webmanifest">
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          "name": "Agent hidden benchmark dataset",
          "url": "https://hidden.example/datasets/agent",
          "license": "https://creativecommons.org/licenses/by/4.0/"
        }
      </script>
      <script>
        window.__APP_CONFIG__ = {
          apiBase: "https://hidden.example/api",
          featureFlags: { agentMode: true }
        };
        fetch("/api/agent-report");
      </script>
      <script id="__NEXT_DATA__" type="application/json">
        { "buildId": "hidden-build", "page": "/agent", "props": { "pageProps": { "title": "Hidden agent payload" } } }
      </script>
    </head>
    <body>
      <main>
        <h1>Hidden agent payload</h1>
        <p>This fixture gives agents readable content plus hidden metadata for page-check routing.</p>
      </main>
    </body>
  </html>
`;

const syntheticWebComponentHtml = `
  <main>
    <h1>Web component controls</h1>
    <x-host-action role="button" aria-describedby="host-help">
      <span slot="label">Host action</span>
      <span id="host-help" slot="help">Host help</span>
      <span>Unprojected host text</span>
      <template shadowrootmode="open">
        <slot name="label">Fallback host action</slot>
        <slot name="help">Fallback host help</slot>
      </template>
    </x-host-action>
    <x-search-box>
      <span id="slotted-label" slot="label">Slotted search label</span>
      <template shadowrootmode="open">
        <label><slot name="label">Fallback search label</slot></label>
        <input type="search" aria-labelledby="slotted-label">
      </template>
    </x-search-box>
  </main>
`;

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

export const agentFixtureTargets: BenchmarkTarget[] = [
  {
    category: "Synthetic search open gate",
    url: "https://www.bing.com/search?q=ax-grep",
    html: syntheticSearchHtml,
  },
  {
    category: "Synthetic search refine gate",
    url: "https://www.baidu.com/s?wd=ax-lite",
    html: syntheticSearchRefineHtml,
    findQueries: ["target claim"],
  },
  {
    category: "Synthetic site search recovery gate",
    url: "https://archive.example/search",
    html: syntheticSiteSearchHtml,
    findQueries: ["target report"],
  },
  {
    category: "Synthetic hidden metadata gate",
    url: "https://hidden.example/agent",
    html: syntheticHiddenMetadataHtml,
  },
  {
    category: "Synthetic web component gate",
    url: "https://components.example/static",
    html: syntheticWebComponentHtml,
  },
  {
    category: "Synthetic action target gate",
    url: "https://actions.example/report",
    html: syntheticActionTargetHtml,
  },
  {
    category: "Synthetic browser HTML retry gate",
    url: "https://blocked.example/app-shell",
    html: syntheticBlockedHtml,
  },
];

export const agentExecutorTargets: BenchmarkTarget[] = [
  ...agentFixtureTargets,
  {
    category: "Example baseline",
    url: "https://example.com",
  },
  {
    category: "Wikipedia portal",
    url: "https://www.wikipedia.org",
  },
  {
    category: "Books listing",
    url: "https://books.toscrape.com/",
  },
  {
    category: "Old Reddit programming",
    url: "https://old.reddit.com/r/programming/",
  },
  {
    category: "Bing search diagnostic",
    url: "https://www.bing.com/search?q=ax-grep",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as executor diagnostics only.",
  },
  {
    category: "Baidu search diagnostic",
    url: "https://www.baidu.com/s?wd=ax-grep",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as executor diagnostics only.",
  },
  {
    category: "Yahoo Japan search diagnostic",
    url: "https://search.yahoo.co.jp/search?p=ax-grep",
    gate: false,
    gateReason: "Search result pages are anti-bot and personalization sensitive; keep as executor diagnostics only.",
  },
];

export function resolveBenchmarkTargets(args: string[], fallback: string[]): BenchmarkTarget[] {
  const targetSetIndex = args.indexOf("--target-set");
  if (targetSetIndex >= 0) {
    const name = args[targetSetIndex + 1];
    if (name === "agent-fixtures") return agentFixtureTargets;
    if (name === "agent-executor") return agentExecutorTargets;
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
