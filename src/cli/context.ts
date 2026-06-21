import { homedir } from "node:os";
import path from "node:path";

export interface CliContext {
  home: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

export function createCliContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    home: overrides.home ?? process.env.TELEGENT_HOME ?? path.join(homedir(), ".telegent"),
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr
  };
}
