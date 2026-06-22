// Prototype broker resource limits and abuse controls.
//
// These are local prototype guards, not a production WAF. They cap concurrency,
// request/response size, route lifetime, and request rate so managed tunnel
// routing can be exercised without runaway resource use. Limit errors carry
// stable codes and generic messages — never raw request details.

import { TunnelError, type TunnelErrorCode } from "./protocol.js";

export interface BrokerLimits {
  hostConnectionsPerRoute: number;
  concurrentRequestsPerRoute: number;
  concurrentWaitsPerRoute: number;
  requestBodyBytes: number;
  responseBodyBytes: number;
  idleTimeoutMs: number;
  maxRouteLifetimeMs: number;
  unauthenticatedPerIpPerMinute: number;
  requestsPerRoutePerMinute: number;
}

export const BROKER_LIMITS: BrokerLimits = {
  hostConnectionsPerRoute: 1,
  concurrentRequestsPerRoute: 64,
  concurrentWaitsPerRoute: 32,
  requestBodyBytes: 64 * 1024,
  responseBodyBytes: 1024 * 1024,
  idleTimeoutMs: 15 * 60_000,
  maxRouteLifetimeMs: 8 * 60 * 60_000,
  unauthenticatedPerIpPerMinute: 60,
  requestsPerRoutePerMinute: 600
};

const RATE_WINDOW_MS = 60_000;

interface InFlight {
  total: number;
  waits: number;
}

interface RateWindow {
  resetAt: number;
  count: number;
}

export interface RequestGuardInput {
  routeSlug: string;
  clientIp: string;
  isWait: boolean;
  authenticated: boolean;
}

/**
 * Tracks per-route concurrency and per-route / per-IP request rate. `enter`
 * admits a request or throws a stable limit error; it returns a release handle
 * that the caller must invoke when the request completes.
 */
export class BrokerGuards {
  private readonly now: () => number;
  private readonly limits: BrokerLimits;
  private readonly inflight = new Map<string, InFlight>();
  private readonly routeRate = new Map<string, RateWindow>();
  private readonly ipRate = new Map<string, RateWindow>();

  constructor(now: () => number, limits: BrokerLimits = BROKER_LIMITS) {
    this.now = now;
    this.limits = limits;
  }

  enter(input: RequestGuardInput): () => void {
    this.admitRate(this.routeRate, input.routeSlug, this.limits.requestsPerRoutePerMinute, "rate_limited");
    if (!input.authenticated) {
      this.admitRate(this.ipRate, input.clientIp, this.limits.unauthenticatedPerIpPerMinute, "rate_limited");
    }

    const counts = this.inflight.get(input.routeSlug) ?? { total: 0, waits: 0 };
    if (counts.total >= this.limits.concurrentRequestsPerRoute) {
      throw limitError("route_request_limit", "too many concurrent requests for this route");
    }
    if (input.isWait && counts.waits >= this.limits.concurrentWaitsPerRoute) {
      throw limitError("wait_limit", "too many concurrent wait requests for this route");
    }

    counts.total += 1;
    if (input.isWait) counts.waits += 1;
    this.inflight.set(input.routeSlug, counts);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.inflight.get(input.routeSlug);
      if (current === undefined) return;
      current.total = Math.max(0, current.total - 1);
      if (input.isWait) current.waits = Math.max(0, current.waits - 1);
      if (current.total === 0 && current.waits === 0) this.inflight.delete(input.routeSlug);
    };
  }

  private admitRate(windows: Map<string, RateWindow>, key: string, perMinute: number, code: TunnelErrorCode): void {
    const nowMs = this.now();
    const window = windows.get(key);
    if (window === undefined || nowMs >= window.resetAt) {
      windows.set(key, { resetAt: nowMs + RATE_WINDOW_MS, count: 1 });
      return;
    }
    if (window.count >= perMinute) {
      throw limitError(code, "request rate limit exceeded");
    }
    window.count += 1;
  }
}

export function limitError(code: TunnelErrorCode, message: string): TunnelError {
  return new TunnelError(code, code === "request_too_large" ? 413 : 429, message);
}
