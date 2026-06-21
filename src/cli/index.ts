#!/usr/bin/env node
import { buildHelpText, VERSION } from "./help.js";
import { createCliContext } from "./context.js";
import { runRoomCommand } from "./commands/room/index.js";

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${buildHelpText()}\n`);
    return 0;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (command === "room") {
    return runRoomCommand(rest, createCliContext());
  }

  process.stderr.write(`Unknown command: ${command}\n\n${buildHelpText()}\n`);
  return 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
