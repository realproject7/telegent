// Wake-on-event attention protocol + negotiation (#152 / V2 9A).
//
// Key principle (from the reference-solution benchmark): separate poll cadence
// from model/session invocation. A watcher may poll `/wait` cheaply, but the
// agent is woken only on an actionable event or a bounded safety timer — an
// EMPTY POLL DOES NOT WAKE THE MODEL. `/wait` stays the canonical no-install
// event source; SSE (#139) would be an active-receive path, NOT a detached wake
// mechanism. `managed` durable reconnect is post-MVP and is intentionally absent
// from the MVP mode enum below.
import type { AttentionMode, Participant } from "./types.js";

// Capability order: most → least capable. (AttentionMode is declared in types.ts
// to keep the Participant shape import-cycle-free; re-exported here for callers.)
export type { AttentionMode };
export const ATTENTION_MODES: readonly AttentionMode[] = [
  "foreground_attended",
  "wake_on_event",
  "heartbeat",
  "manual"
];
export const DEFAULT_ATTENTION_MODE: AttentionMode = "manual";

// Advisory bounds. poll_cadence_s is a CHECK interval — it does NOT imply a
// model-invocation cadence. safety_wake_s bounds silence before one safety wake.
export const DEFAULT_POLL_CADENCE_S = 30;
export const DEFAULT_SAFETY_WAKE_S = 1800;

export function isAttentionMode(value: unknown): value is AttentionMode {
  return typeof value === "string" && (ATTENTION_MODES as readonly string[]).includes(value);
}

export function parseAttentionMode(value: string): AttentionMode {
  if (isAttentionMode(value)) return value;
  throw new Error(`attention mode must be one of: ${ATTENTION_MODES.join(", ")}`);
}

// 0 = most capable (foreground_attended) … 3 = least capable (manual).
export function attentionRank(mode: AttentionMode): number {
  return ATTENTION_MODES.indexOf(mode);
}

// Validate + dedupe declared modes and order them most → least capable.
export function normalizeSupportedModes(modes: readonly string[]): AttentionMode[] {
  const seen = new Set<AttentionMode>();
  for (const raw of modes) seen.add(parseAttentionMode(raw));
  return ATTENTION_MODES.filter((mode) => seen.has(mode));
}

// effective_mode = the most capable mode that does NOT exceed `requested` and is
// in `supported`; if there is no such mode, degrade honestly to `manual`.
// "Does not exceed requested" = capability no greater than requested
// (attentionRank >= the requested rank). `manual` is the universal floor (the
// absence of active attention), so degrading to it never claims an undeclared
// capability.
export function negotiateEffectiveMode(supported: readonly AttentionMode[], requested: AttentionMode): AttentionMode {
  const requestedRank = attentionRank(requested);
  let best: AttentionMode | undefined;
  for (const mode of supported) {
    if (attentionRank(mode) < requestedRank) continue; // would exceed the requested ceiling
    if (best === undefined || attentionRank(mode) < attentionRank(best)) best = mode;
  }
  return best ?? "manual";
}

// True when the negotiated mode is less capable than what the host requested.
export function isDegraded(effective: AttentionMode, requested: AttentionMode): boolean {
  return attentionRank(effective) > attentionRank(requested);
}

export interface NegotiatedAttention {
  supported_modes: AttentionMode[];
  requested_mode: AttentionMode;
  effective_mode: AttentionMode;
}

// Compute a participant's negotiated attention from its declared support and the
// host's requested mode. An undeclared request defaults to the most capable mode
// (the host accepts whatever the participant can offer); undeclared support
// degrades to `manual`.
export function negotiateParticipantAttention(participant: Participant): NegotiatedAttention {
  const supported = normalizeSupportedModes(participant.supported_modes ?? []);
  const requested = participant.requested_mode ?? "foreground_attended";
  return {
    supported_modes: supported,
    requested_mode: requested,
    effective_mode: negotiateEffectiveMode(supported, requested)
  };
}

export function describeAttentionMode(mode: AttentionMode): string {
  if (mode === "foreground_attended") return "Actively attended in the foreground.";
  if (mode === "wake_on_event") return "Watching cheaply; woken only on an actionable event or a bounded safety timer (empty polls do not wake the agent).";
  if (mode === "heartbeat") return "Periodic heartbeat check-ins; not continuously attended.";
  return "Manual / drop-in; not actively watching.";
}
