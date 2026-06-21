import { flagBoolean, flagString, parseArgs } from "../../args.js";
import type { CliContext } from "../../context.js";
import { currentSinceId, formatMessages, parseSinceId, waitOnce } from "../message/transport.js";

export async function runAttendCommand(argv: string[], context: CliContext): Promise<number> {
  const args = parseArgs(argv);
  let sinceId = await currentSinceId(context, flagString(args, "since"));
  const maxTurnsRaw = flagString(args, "max-turns");
  const maxTurns = maxTurnsRaw === undefined ? undefined : parseSinceId(maxTurnsRaw);
  let turns = 0;

  while (maxTurns === undefined || turns < maxTurns) {
    const response = await waitOnce(context, sinceId);
    turns += 1;
    sinceId = response.next_since_id;

    if (flagBoolean(args, "json")) {
      context.stdout.write(
        `${JSON.stringify({
          ...response,
          cli_next_cmd: response.keep_waiting ? `telegent attend --since ${sinceId} --json` : null
        })}\n`
      );
    } else if (response.messages.length > 0) {
      context.stdout.write(formatMessages(response.messages));
    }

    if (!response.keep_waiting) break;
  }

  return 0;
}
