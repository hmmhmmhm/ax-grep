import process from "node:process";
import { runCli } from "../src/cli";
import type { AgentJsonEnvelope } from "../src/index";

type SmokeTarget = {
  url: string;
  minSemanticNamedRoles: number;
  expectedStatus: "ready" | "verify";
};

const targets: SmokeTarget[] = [
  {
    url: "https://example.com",
    minSemanticNamedRoles: 2,
    expectedStatus: "ready",
  },
];

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const target of targets) {
    const stdout = createMemoryWriter();
    const stderr = createMemoryWriter();
    const status = await runCli([target.url, "--agent-brief", "--timeout", "10000"], {
      stdout,
      stderr,
    });

    if (status !== 0) {
      failures.push(`${target.url}: ax-grep exited ${status}: ${trim(stderr.output || stdout.output)}`);
      continue;
    }

    let envelope: AgentJsonEnvelope;
    try {
      envelope = JSON.parse(stdout.output) as AgentJsonEnvelope;
    } catch (error) {
      failures.push(`${target.url}: failed to parse JSON: ${trim(String(error))}`);
      continue;
    }

    const agent = envelope.agent;
    if (!agent) {
      failures.push(`${target.url}: missing agent summary`);
      continue;
    }

    if (agent.status !== target.expectedStatus) {
      failures.push(`${target.url}: expected agent.status=${target.expectedStatus}, got ${agent.status}`);
    }
    if (agent.needsBrowserHtml !== false) {
      failures.push(`${target.url}: expected needsBrowserHtml=false, got ${String(agent.needsBrowserHtml)}`);
    }
    if (agent.canUseFetchedHtml !== true) {
      failures.push(`${target.url}: expected canUseFetchedHtml=true, got ${String(agent.canUseFetchedHtml)}`);
    }
    if (agent.staticReadiness === "needs-browser") {
      failures.push(`${target.url}: staticReadiness unexpectedly needs browser`);
    }
    if ((agent.semanticNamedRoleCount ?? 0) < target.minSemanticNamedRoles) {
      failures.push(`${target.url}: semanticNamedRoleCount below ${target.minSemanticNamedRoles}: ${String(agent.semanticNamedRoleCount)}`);
    }
    if (agent.next?.mode === "browser" || agent.next?.mode === "capture-html") {
      failures.push(`${target.url}: next.mode unexpectedly requests browser work: ${agent.next.mode}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(`real-page smoke: ok (${targets.length} target)`);
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
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
