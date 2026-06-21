# Telegent Release Dogfood

This script verifies the MVP success statement without external services or a
central Telegent cloud.

## Automated Check

Run:

```bash
pnpm test -- --test-name-pattern "e2e dogfood"
```

The e2e test creates a temporary local room with:

- a host human/operator participant
- one installed CLI-style agent participant
- one no-install curl-style agent participant
- one browser human participant

It verifies:

- CLI participants exchange messages.
- A no-install participant uses `/card`, `/wait`, and `/messages`.
- Attend Card and `/brief` expose the same current brief version.
- Brief updates increment `brief_version` and emit a system message.
- A browser human can send and read messages.
- Closing the room releases a held `/wait` with `keep_waiting: false`.

## Manual Smoke Check

```bash
pnpm build
TELEGENT_HOME="$(mktemp -d)" node dist/src/cli/index.js room start dogfood-room --alias operator --brief "Coordinate the release check." --json
TELEGENT_HOME="$TELEGENT_HOME" node dist/src/cli/index.js room serve --port 8787
```

In another shell, invite a participant:

```bash
TELEGENT_HOME="$TELEGENT_HOME" node dist/src/cli/index.js room invite reviewer --json
TELEGENT_HOME="$TELEGENT_HOME" node dist/src/cli/index.js room invite-card reviewer
```

Open the browser room with a fragment token:

```text
http://127.0.0.1:8787/#token=<participant-token>
```

Do not put participant tokens in query strings.

## Fixture Hygiene

`docs/dogfood/sanitized-room-log.jsonl` is synthetic and sanitized:

- no bearer tokens
- no private machine paths
- no private operator messages
- no external service dependency

