import { spawnSync } from "node:child_process";
import process from "node:process";

export type ProcessInfo = {
  pid: number;
  ppid: number;
  command: string;
};

const processPatterns = [
  /\bagent-browser\b/,
  /\btsx\s+scripts\/compare\.ts\b/,
  /\bpnpm\s+compare(?:\s|$)/,
  /\btsx\s+scripts\/compare-static\.ts\b/,
  /\bpnpm\s+compare:static\b/,
  /\bpnpm\s+test\b/,
  /\bvitest\b/,
];

if (isMainModule()) {
  const matches = findProjectProcesses(readProcessTable(), process.pid);
  if (matches.length === 0) {
    console.log("No project browser/test/comparison processes found.");
    process.exit(0);
  }

  for (const item of matches) {
    console.log(`${item.pid} ${item.ppid} ${item.command}`);
  }
  process.exit(1);
}

export function findProjectProcesses(lines: string[], currentPid: number): ProcessInfo[] {
  return lines
    .map(parseProcessLine)
    .filter((item): item is ProcessInfo => Boolean(item))
    .filter((item) => item.pid !== currentPid)
    .filter((item) => !item.command.includes("scripts/check-project-processes"))
    .filter((item) => !isProbeCommand(item.command))
    .filter((item) => processPatterns.some((pattern) => pattern.test(item.command)));
}

function isProbeCommand(command: string): boolean {
  return /\bpgrep\s+-[^\s]*a[^\s]*f\b/.test(command) || command.includes("pnpm check:processes");
}

function readProcessTable(): string[] {
  const result = spawnSync("ps", ["-eo", "pid=,ppid=,command="], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || "failed to read process table");
    process.exit(2);
  }
  return result.stdout.split(/\r?\n/);
}

function parseProcessLine(line: string): ProcessInfo | undefined {
  const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
  if (!match) return undefined;
  const pid = Number.parseInt(match[1] ?? "", 10);
  const ppid = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(pid) || !Number.isFinite(ppid)) return undefined;
  return { pid, ppid, command: match[3] ?? "" };
}

function isMainModule(): boolean {
  return process.argv[1]?.endsWith("check-project-processes.ts") === true;
}
