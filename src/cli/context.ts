import { homedir } from "node:os";
import path from "node:path";

export interface CliContext {
  home: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

export function createCliContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    home: overrides.home ?? process.env.AGENTGATHER_HOME ?? path.join(homedir(), ".agentgather"),
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr
  };
}
