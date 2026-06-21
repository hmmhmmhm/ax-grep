import { spawnSync } from "node:child_process";
import process from "node:process";

type AgentBriefEnvelope = {
  ok?: boolean;
  kind?: string;
  url?: string;
  agent?: {
    status?: string;
    needsBrowserHtml?: boolean;
  };
  pageCheck?: {
    status?: string;
  };
};

const command = [
  "exec",
  "--yes",
  "--package",
  "ax-grep@latest",
  "--",
  "ax-grep",
  "https://example.com",
  "--agent-brief",
  "--timeout",
  "15000",
];

const result = spawnSync("npm", command, {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
  timeout: 60_000,
});

const failures: string[] = [];
if (result.status !== 0) {
  failures.push(`npm exec exited ${String(result.status)}: ${trim(result.stderr || result.stdout)}`);
}

let envelope: AgentBriefEnvelope | undefined;
try {
  envelope = JSON.parse(result.stdout) as AgentBriefEnvelope;
} catch (error) {
  failures.push(`failed to parse package CLI JSON: ${trim(String(error))}`);
}

if (envelope) {
  if (envelope.ok !== true) failures.push(`expected ok=true, got ${String(envelope.ok)}`);
  if (!["content-page", "page"].includes(envelope.kind ?? "")) failures.push(`expected kind=content-page or page, got ${String(envelope.kind)}`);
  if (envelope.agent?.status !== "ready") failures.push(`expected agent.status=ready, got ${String(envelope.agent?.status)}`);
  if (envelope.agent?.needsBrowserHtml !== false) failures.push(`expected needsBrowserHtml=false, got ${String(envelope.agent?.needsBrowserHtml)}`);
  if (!envelope.pageCheck) failures.push("expected pageCheck in published package output");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("published package smoke: ok (ax-grep@latest, https://example.com)");

function trim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 400);
}
