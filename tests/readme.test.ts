import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenReadmeFragments = [
  '"gateSummary"',
  '"comparisons"',
  '"generatedAt"',
  "Total output lines",
  "\uFFFD",
  "\u00EC",
  "\u00EB",
  "\u00ED",
  "\u00EA",
];

describe("README", () => {
  it("stays concise and avoids generated or mojibake content", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    const lines = readme.split(/\r?\n/);
    expect(lines.length).toBeLessThan(120);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(140);
    for (const fragment of forbiddenReadmeFragments) {
      expect(readme).not.toContain(fragment);
    }

    expect(readme).toContain('<div align="center">');
    expect(readme).toContain('<img src="./docs/assets/ax-grep-og.png" alt="ax-grep promo image" width="920">');
    expect(readme).toContain('<img src="./docs/assets/ax-grep-benchmark.png" alt="ax-grep benchmark comparison image" width="920">');
    expect(readme).toContain('<img src="./docs/assets/ax-grep-search.png" alt="ax-grep auto search comparison image" width="920">');
    expect(readme).toContain("agent-ready-0b7f3a.svg");
    expect(readme).toContain("Codex-skill-111111.svg");
    expect(readme).toContain("Claude-compatible-5b4b8a.svg");
    expect(readme).toContain("Gemini-ready-1a73e8.svg");
    expect(readme).toContain("tries DuckDuckGo, Bing, and StartPage");
    expect(readme).toContain("hCaptcha, reCAPTCHA, and Cloudflare challenge markers");
    expect(readme).toContain("15.4x less peak");
    expect(readme).toContain("RAM and 3.0x fewer decision tokens");
    expect(readme).toContain("3.0x fewer decision tokens");
    expect(readme).toContain("coverage-100%25-brightgreen.svg");
    expect(readme).toContain("[Agent handoff loop](./docs/agent-handoff.md)");
    expect(readme).not.toContain("## Compact JSON Example");
  });

  it("keeps the README promo image available for GitHub social preview", async () => {
    const image = await readFile(join(process.cwd(), "docs", "assets", "ax-grep-og.png"));
    const benchmarkImage = await readFile(join(process.cwd(), "docs", "assets", "ax-grep-benchmark.png"));
    const searchImage = await readFile(join(process.cwd(), "docs", "assets", "ax-grep-search.png"));

    expect(image.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(image.length).toBeGreaterThan(100_000);
    expect(benchmarkImage.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(benchmarkImage.length).toBeGreaterThan(100_000);
    expect(searchImage.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(searchImage.length).toBeGreaterThan(100_000);
  });

  it("puts prompt trial before install, library, and WebView usage", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      files?: string[];
    };
    const skill = await readFile(join(process.cwd(), "skills", "ax-grep-cli", "SKILL.md"), "utf8");
    const installer = await readFile(join(process.cwd(), "skills.sh"), "utf8");

    const promptIndex = readme.indexOf("## 1. Try With A Prompt");
    const skillIndex = readme.indexOf("## 2. Install The CLI Skill");
    const tryIndex = readme.indexOf("## 3. Try The CLI");
    const serverIndex = readme.indexOf("## 4. Use From A Server");
    const webviewIndex = readme.indexOf("## 5. Use In WebViews Or Pages");

    expect(promptIndex).toBeGreaterThan(-1);
    expect(skillIndex).toBeGreaterThan(-1);
    expect(skillIndex).toBeGreaterThan(promptIndex);
    expect(tryIndex).toBeGreaterThan(skillIndex);
    expect(serverIndex).toBeGreaterThan(tryIndex);
    expect(webviewIndex).toBeGreaterThan(serverIndex);
    expect(readme).toContain("Paste this into a Codex session or subagent prompt");
    expect(readme).toContain("Before opening a browser, inspect pages with ax-grep when possible.");
    expect(readme).toContain("curl -fsSL https://raw.githubusercontent.com/hmmhmmhm/ax-grep/main/skills.sh | sh");
    expect(readme).toContain("npx --yes ax-grep@latest https://example.com --agent-brief");
    expect(readme).toContain("This installs the Codex skill prompt only.");
    expect(readme).toContain("[CLI skill prompt](./skills/ax-grep-cli/SKILL.md)");
    expect(skill).toContain("Use `ax-grep` before browser automation");
    expect(skill).toContain("npx --yes ax-grep@latest");
    expect(skill).toContain("agent.executor");
    expect(installer).toContain("ax-grep-cli");
    expect(packageJson.files).toEqual(expect.arrayContaining(["docs", "skills", "skills.sh"]));
  });

  it("keeps the agent continuation contract in docs", async () => {
    const handoff = await readFile(join(process.cwd(), "docs", "agent-handoff.md"), "utf8");

    expect(handoff).toContain("Executors can usually switch");
    expect(handoff).toContain("only on `agent.executor.decision`");
    expect(handoff).toContain("const step: AgentExecutorStep = payload.agent.executor");
    expect(handoff).toContain("commandArgs.slice(1)");
    expect(handoff).toContain("sourceLinkRef");
  });

  it("keeps agent-readiness evidence outside the root README", async () => {
    const docsIndex = await readFile(join(process.cwd(), "docs", "README.md"), "utf8");
    const readiness = await readFile(join(process.cwd(), "docs", "agent-readiness.md"), "utf8");

    expect(docsIndex).toContain("[agent-readiness.md](./agent-readiness.md)");
    expect(readiness).toContain("Evidence Map");
    expect(readiness).toContain("Completion Gate");
    expect(readiness).toContain("Browser-backed comparison suites must run sequentially");
  });

  it("documents the non-browser fixture gate outside the root README", async () => {
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const benchmarks = await readFile(join(process.cwd(), "docs", "benchmarks.md"), "utf8");

    expect(pkg.scripts?.["compare:static:fixtures:gate"]).toBe("tsx scripts/check-fixture-static-gate.ts");
    expect(benchmarks).toContain("pnpm compare:static:fixtures:gate");
    expect(benchmarks).toContain("non-browser smoke gate");
    expect(benchmarks).toContain("should not fetch remote pages or launch");
  });
});
