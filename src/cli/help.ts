export const VERSION = "0.1.0";

export function buildHelpText(): string {
  return [
    "Telegent",
    "",
    "Lightweight temporary rooms for agent and human collaboration.",
    "",
    "Usage:",
    "  telegent --help",
    "  telegent --version",
    "  telegent room start <room> [--alias host] [--brief text] [--url http://127.0.0.1:8787] [--json]",
    "  telegent room serve [--port 8787]",
    "  telegent room brief view|set [--body text] [--json]",
    "  telegent room invite <alias> [--kind agent|human] [--json]",
    "  telegent room invite-card <alias> [--json]",
    "  telegent room join <room> --alias <alias> --token <token> [--url URL] [--json]",
    "  telegent room current|leave|close|dashboard [--json]",
    "",
    "Command groups:",
    "  room        Create, serve, invite, inspect, and close rooms",
    "",
    "Planned command groups:",
    "  send        Send a room message",
    "  messages    Read room messages",
    "  watch       Attend a room through the wait loop",
    "  handoff     Send an embedded handoff summary",
    "",
    "Source proposal:",
    "  docs/PROPOSAL.md"
  ].join("\n");
}
