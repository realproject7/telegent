import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/cli/index.js", import.meta.url));

// The home points at an empty dir with no current room. If `<command> --help`
// actually ran the command it would read the current room (or hit the network)
// and exit non-zero; resolving with exit 0 proves help short-circuits first.
test("subcommand --help exits 0 and prints help without side effects", async () => {
  const env = { ...process.env, AGENTGATHER_HOME: await mkdtemp(path.join(os.tmpdir(), "agentgather-help-")) };

  const cases: Array<[string, RegExp]> = [
    ["attend", /GET \/wait/],
    ["watch", /one .*\/wait turn/i],
    ["tunnel", /tunnel run/],
    ["doctor", /\/wait readiness/]
  ];
  for (const [command, pattern] of cases) {
    const { stdout } = await run(process.execPath, [cliPath, command, "--help"], { env });
    assert.match(stdout, /agentgather/);
    assert.match(stdout, pattern, `help for ${command} should match ${pattern}`);
  }
});

test("attend and watch help describe /wait, and -h is also honored", async () => {
  const env = { ...process.env, AGENTGATHER_HOME: await mkdtemp(path.join(os.tmpdir(), "agentgather-help2-")) };
  const attend = await run(process.execPath, [cliPath, "attend", "--help"], { env });
  assert.match(attend.stdout, /attend uses \/wait, not \/watch/);
  const watch = await run(process.execPath, [cliPath, "watch", "-h"], { env });
  assert.match(watch.stdout, /one-turn compatibility alias/);
});
