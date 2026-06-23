import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fileMeteringStore,
  MeteringLedger,
  type MeteredDimension,
  type MeteringRecord,
  type MeteringStore
} from "../src/platform/index.js";
import { TunnelError } from "../src/tunnel/index.js";

const T0 = 1_750_000_000_000;

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "agentgather-metering-test-"));
}

function memoryStore(): MeteringStore {
  const map = new Map<string, MeteringRecord>();
  return {
    async read(subject) {
      return map.get(subject) ?? null;
    },
    // The synchronous mutator cannot interleave with another update in
    // single-threaded JS, so the in-memory update is inherently atomic.
    async update(subject, mutate) {
      const next = mutate(map.get(subject) ?? null);
      map.set(subject, next);
      return next;
    }
  };
}

test("usage counters increment predictably across dimensions", async () => {
  const ledger = new MeteringLedger({ store: memoryStore(), now: () => T0, windowMs: 1_000 });
  await ledger.record("owner-1", "relay_requests");
  await ledger.record("owner-1", "relay_requests", 2);
  await ledger.record("owner-1", "bandwidth_bytes", 100);
  await ledger.record("owner-1", "participant_joins", 1);

  const usage = await ledger.usage("owner-1");
  assert.equal(usage.window.counters.relay_requests, 3);
  assert.equal(usage.window.counters.bandwidth_bytes, 100);
  assert.equal(usage.window.counters.participant_joins, 1);
  assert.equal(usage.window.counters.route_minutes, 0);
  assert.equal(usage.exceeded, false);
});

test("the daily quota window resets when the clock crosses a window boundary", async () => {
  let nowMs = 10_000;
  const ledger = new MeteringLedger({ store: memoryStore(), now: () => nowMs, windowMs: 1_000 });
  await ledger.record("owner-1", "relay_requests", 5);
  const firstWindow = (await ledger.usage("owner-1")).window.window_id;

  nowMs = 11_500; // crosses into the next window
  const rolled = await ledger.record("owner-1", "relay_requests", 1);
  assert.notEqual(rolled?.window.window_id, firstWindow);
  assert.equal(rolled?.window.counters.relay_requests, 1);

  // Same window again: it accumulates rather than resetting.
  nowMs = 11_900;
  const same = await ledger.record("owner-1", "relay_requests", 2);
  assert.equal(same?.window.window_id, rolled?.window.window_id);
  assert.equal(same?.window.counters.relay_requests, 3);
});

test("a configured free quota produces a clear quota-exceeded signal and TunnelError", async () => {
  const ledger = new MeteringLedger({ store: memoryStore(), now: () => T0, windowMs: 1_000, quota: { relay_requests: 2 } });
  await ledger.record("owner-1", "relay_requests", 2);
  assert.equal((await ledger.check("owner-1")).exceeded, false);

  const over = await ledger.record("owner-1", "relay_requests", 1);
  assert.equal(over?.exceeded, true);
  assert.deepEqual(over?.exceeded_reasons, ["relay_requests"]);

  await assert.rejects(
    ledger.assertWithinQuota("owner-1"),
    (error: unknown) =>
      error instanceof TunnelError && error.code === "quota_exceeded" && error.status === 429
  );
});

test("local-only routes are not metered and are never blocked by the public quota", async () => {
  const ledger = new MeteringLedger({ store: memoryStore(), now: () => T0, windowMs: 1_000, quota: { relay_requests: 1 } });

  // Local usage is skipped entirely: nothing recorded.
  assert.equal(await ledger.record("owner-1", "relay_requests", 5, { isPublicRoute: false }), null);
  assert.equal((await ledger.usage("owner-1")).window.counters.relay_requests, 0);

  // Drive the public quota over the limit.
  await ledger.record("owner-1", "relay_requests", 2);
  await assert.rejects(ledger.assertWithinQuota("owner-1"));
  // A local admit is still permitted even while the public quota is exceeded.
  await ledger.assertWithinQuota("owner-1", { isPublicRoute: false });
});

test("file-backed counters survive a simulated process restart", async () => {
  const root = await makeRoot();
  const first = new MeteringLedger({ store: fileMeteringStore(root), now: () => T0 });
  await first.record("owner-1", "participant_joins", 3);
  await first.record("owner-1", "route_minutes", 12);

  const second = new MeteringLedger({ store: fileMeteringStore(root), now: () => T0 });
  const usage = await second.usage("owner-1");
  assert.equal(usage.window.counters.participant_joins, 3);
  assert.equal(usage.window.counters.route_minutes, 12);
});

test("concurrent records do not lose increments under the file store lock", async () => {
  const root = await makeRoot();
  const ledger = new MeteringLedger({ store: fileMeteringStore(root), now: () => T0 });
  // Without an atomic read/increment/write these would race and undercount; the
  // writer lock around the whole update serializes them.
  await Promise.all(Array.from({ length: 20 }, () => ledger.record("owner-1", "relay_requests", 1)));
  assert.equal((await ledger.usage("owner-1")).window.counters.relay_requests, 20);
});

test("metering records carry no message bodies, tokens, or invite URLs", async () => {
  const ledger = new MeteringLedger({ store: memoryStore(), now: () => T0 });
  const record = await ledger.record("owner-1", "bandwidth_bytes", 4096);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /Bearer|tgl_|"text"|"body"|brief|message_body|invite/);
  // Only safe metering metadata is present.
  assert.deepEqual(Object.keys(record ?? {}).sort(), [
    "exceeded",
    "exceeded_reasons",
    "subject",
    "updated_at",
    "window"
  ]);
});

test("invalid subjects and unknown dimensions are rejected", async () => {
  const ledger = new MeteringLedger({ store: memoryStore(), now: () => T0 });
  await assert.rejects(ledger.record("bad subject!", "relay_requests"));
  await assert.rejects(ledger.record("../escape", "relay_requests"));
  await assert.rejects(ledger.record("owner-1", "not_a_dimension" as MeteredDimension));
});
