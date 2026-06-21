import process from "node:process";
import { runCli } from "../src/cli";

type SearchSmokeEnvelope = {
  kind?: string;
  searchEngine?: string;
  selectedSearchEngine?: string;
  searchEngines?: Array<{
    engine?: string;
    ok?: boolean;
    resultCount?: number;
    error?: { code?: string; status?: number };
  }>;
  sourceSearch?: {
    resultCount?: number;
    results?: Array<{ title?: string; url?: string }>;
  };
  searchResults?: Array<{ title?: string; url?: string }>;
  agent?: {
    status?: string;
    sourceSearchEngineAttemptCount?: number;
    sourceSearchOkEngineCount?: number;
    sourceSearchSelectedEngine?: string;
    primaryAction?: { action?: string; commandArgs?: string[] };
  };
};

const query = "ax-grep npm";

async function main(): Promise<void> {
  const stdout = createMemoryWriter();
  const stderr = createMemoryWriter();
  const status = await runCli(["--search", query, "--engine", "auto", "--agent-brief", "--timeout", "15000"], {
    stdout,
    stderr,
  });
  const failures: string[] = [];

  if (status !== 0) failures.push(`ax-grep exited ${status}: ${trim(stderr.output || stdout.output)}`);

  let envelope: SearchSmokeEnvelope | undefined;
  try {
    envelope = JSON.parse(stdout.output) as SearchSmokeEnvelope;
  } catch (error) {
    failures.push(`failed to parse JSON: ${trim(String(error))}`);
  }

  if (envelope) {
    const attempts = envelope.searchEngines ?? [];
    const resultCount = envelope.sourceSearch?.resultCount ?? envelope.searchResults?.length ?? 0;
    const okAttempts = attempts.filter((attempt) => attempt.ok === true && (attempt.resultCount ?? 0) > 0);
    if (envelope.kind !== "search-results") failures.push(`expected kind=search-results, got ${String(envelope.kind)}`);
    if (envelope.searchEngine !== "auto") failures.push(`expected searchEngine=auto, got ${String(envelope.searchEngine)}`);
    if (!["duckduckgo", "bing", "startpage"].includes(envelope.selectedSearchEngine ?? "")) {
      failures.push(`unexpected selectedSearchEngine=${String(envelope.selectedSearchEngine)}`);
    }
    if (attempts.length < 2) failures.push(`expected multiple engine attempts, got ${attempts.length}`);
    if (okAttempts.length < 1) failures.push("expected at least one successful engine attempt with results");
    if (resultCount < 1) failures.push(`expected at least one source search result, got ${resultCount}`);
    if (envelope.agent?.status !== "choose-result") failures.push(`expected agent.status=choose-result, got ${String(envelope.agent?.status)}`);
    if (!envelope.sourceSearch?.results?.[0]?.url && !envelope.searchResults?.[0]?.url) {
      failures.push("expected a ranked source result URL");
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(`search smoke: ok (${query}, selected ${envelope?.selectedSearchEngine})`);
}

function createMemoryWriter(): Pick<NodeJS.WriteStream, "write"> & { output: string } {
  const writer = {
    output: "",
    write(chunk: string | Uint8Array): boolean {
      writer.output += chunk.toString();
      return true;
    },
  };
  return writer;
}

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
