import { describe, expect, it } from "vitest";
import { runStaticComparisons } from "../scripts/compare-static";

describe("compare-static fixture comparisons", () => {
  it("produces gate-ready agent metrics without browser-backed targets", async () => {
    const report = await runStaticComparisons([
      {
        category: "Fixture search",
        url: "https://www.bing.com/search?q=ax-grep",
        html: `
          <main>
            <ol>
              <li class="b_algo">
                <h2><a href="https://docs.example/ax-grep">ax-grep agent guide</a></h2>
                <p>Practical guide for using ax-grep as an agent search and page checking tool.</p>
              </li>
            </ol>
          </main>
        `,
      },
      {
        category: "Fixture hidden metadata",
        url: "https://hidden.example/agent",
        html: `
          <html>
            <head>
              <title>Hidden agent payload</title>
              <meta name="application-name" content="Agent Console">
              <meta name="citation_doi" content="10.5555/agent-check.2026">
              <link rel="manifest" href="/app.webmanifest">
              <script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Dataset","name":"Agent hidden benchmark dataset","url":"https://hidden.example/datasets/agent"}
              </script>
              <script>
                window.__APP_CONFIG__ = { apiBase: "https://hidden.example/api" };
                fetch("/api/agent-report");
              </script>
            </head>
            <body>
              <main>
                <h1>Hidden agent payload</h1>
                <p>This fixture gives agents readable content plus hidden metadata.</p>
              </main>
            </body>
          </html>
        `,
      },
    ]);

    expect(report.gateSummary.included).toBe(2);
    expect(report.comparisons.map((comparison) => comparison.fetch.source)).toEqual(["fixture", "fixture"]);
    expect(report.gateSummary.averageCliAgentScore).toBeGreaterThanOrEqual(0.8);
    expect(report.gateSummary.averageAgentExecutorScore).toBeGreaterThanOrEqual(0.995);
    expect(report.gateSummary.averageActionSchemaScore).toBe(1);
    expect(report.gateSummary.averageSearchResultActionScore).toBe(1);
    expect(report.gateSummary.averageAgentHiddenSignalScore).toBe(1);
  });
});
