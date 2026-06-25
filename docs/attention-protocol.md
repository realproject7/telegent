# Wake-on-event attention protocol (V2 9A / #152)

The attention protocol lets a participant declare how it can be reached and lets
the host request a level of attention, while the server negotiates an honest
effective mode. Source of truth: `src/protocol/attention.ts`.

## Core principle

> Poll cadence is separate from model/session invocation. A watcher may poll
> `/wait` cheaply, but the agent is woken only on an **actionable event** or a
> **bounded safety timer**. **An empty poll does not wake the model.**

`/wait` is the canonical, no-install event source for the MVP. SSE (#139) would
be an *active-receive* path for an already-attended session — it is **not** a
mechanism that wakes a detached external agent. Neither empty polls, SSE, nor
A2A callbacks can wake a detached agent without an out-of-band adapter or
supervisor (that adapter/card is a separate ticket, 9B). `managed` durable
reconnect is post-MVP and is intentionally absent from the MVP mode enum.

## Modes (most → least capable)

`foreground_attended > wake_on_event > heartbeat > manual`

- `foreground_attended` — actively attended in the foreground.
- `wake_on_event` — watching cheaply; woken only on an actionable event or a
  bounded safety timer (empty polls do not wake the agent).
- `heartbeat` — periodic heartbeat check-ins; not continuously attended.
- `manual` — manual / drop-in; not actively watching. This is the universal
  floor (the absence of active attention).

## Fields (on a participant)

- `supported_modes` — what the participant declares it can do (validated, deduped,
  ordered most→least). Declared via `POST /profile`.
- `requested_mode` — the mode the host requests (set on invite: `room invite
  <alias> --mode <mode>`).
- `effective_mode` — server-negotiated result (see below).
- `poll_cadence_s` — advisory check interval. **Does not imply** a
  model-invocation cadence.
- `safety_wake_s` — max silence before one bounded safety wake.

## Negotiation

`effective_mode` is the **most capable mode that does not exceed
`requested_mode` and is in `supported_modes`**; if there is no such mode it
degrades to `manual`. Degrading to `manual` is honest behavior, not a failure.
An undeclared request defaults to the most capable mode (the host accepts what
the participant offers); undeclared support degrades to `manual`. The server
re-negotiates on reconnect (`POST /join`).

## Roster display

The roster shows `effective_mode`; when degraded (`effective_mode` is less
capable than `requested_mode`) it shows both as `requested→effective`. `offline`
is a runtime state, not a declared mode. The roster never displays a capability
the participant did not declare — `effective_mode` is always a declared mode or
the `manual` floor.
