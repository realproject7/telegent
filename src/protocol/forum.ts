// FROZEN forum data contract (#150 / T6).
//
// This is the centerpiece for async, non-foreground agent collaboration. T8
// (forum UI) and T10 (forum attend-card path) build against these exact shapes,
// the status vocabulary, and the tag representation WITHOUT redefining them.
// Treat any change to a field name, the status enum, or the tag shape as a
// breaking change to the contract — bump FORUM_SCHEMA_VERSION and coordinate
// downstream. Persisted JSON uses snake_case throughout.
import { assertSafeSlug, isSafeSlug } from "./validation.js";

export const FORUM_SCHEMA_VERSION = 1;

// Status vocabulary (frozen). A post opens, may be answered or resolved, and can
// be closed. `open` is the default for a new post.
export type ForumPostStatus = "open" | "answered" | "resolved" | "closed";
export const FORUM_POST_STATUSES: readonly ForumPostStatus[] = ["open", "answered", "resolved", "closed"];
export const DEFAULT_FORUM_POST_STATUS: ForumPostStatus = "open";

// Tags (frozen): a deduped, order-preserving list of lowercase [a-z0-9-] slugs.
export const MAX_FORUM_TAGS = 12;
export const MAX_FORUM_TITLE_LENGTH = 200;
export const MAX_FORUM_BODY_LENGTH = 16_000;

// Frozen post shape. `author` is a participant alias (stable identity) — never a
// raw token. `body` is Markdown, rendered by the existing safe renderer (T8).
export interface ForumPost {
  schema_version: number;
  id: string;
  channel_id: string;
  author: string;
  title: string;
  body: string;
  status: ForumPostStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// Frozen comment shape. Comments are append-only under their post.
export interface ForumComment {
  schema_version: number;
  id: string;
  post_id: string;
  channel_id: string;
  author: string;
  body: string;
  created_at: string;
}

export function parseForumStatus(value: string): ForumPostStatus {
  if ((FORUM_POST_STATUSES as readonly string[]).includes(value)) return value as ForumPostStatus;
  throw new Error(`forum status must be one of ${FORUM_POST_STATUSES.join(", ")}`);
}

// Normalize tags to the frozen representation: trim, lowercase, drop empties,
// dedupe (order-preserving), validate as slugs, and cap the count.
export function normalizeForumTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag.length === 0 || out.includes(tag)) continue;
    if (!isSafeSlug(tag)) throw new Error(`forum tag must be lowercase [a-z0-9-]: ${raw}`);
    out.push(tag);
  }
  if (out.length > MAX_FORUM_TAGS) throw new Error(`a forum post may have at most ${MAX_FORUM_TAGS} tags`);
  return out;
}

export function assertForumTitle(title: string): void {
  if (title.trim().length === 0) throw new Error("forum post title is required");
  if (title.length > MAX_FORUM_TITLE_LENGTH) {
    throw new Error(`forum post title must be <= ${MAX_FORUM_TITLE_LENGTH} characters`);
  }
}

export function assertForumBody(body: string): void {
  if (body.length > MAX_FORUM_BODY_LENGTH) {
    throw new Error(`forum body must be <= ${MAX_FORUM_BODY_LENGTH} characters`);
  }
}

export function assertSchemaVersion(value: unknown, label: string): void {
  if (value !== FORUM_SCHEMA_VERSION) {
    throw new Error(`${label} schema_version must be ${FORUM_SCHEMA_VERSION} (got ${String(value)})`);
  }
}

export function assertValidForumPost(post: ForumPost): void {
  assertSchemaVersion(post.schema_version, "forum post");
  assertSafeSlug(post.id, "forum post id");
  assertSafeSlug(post.channel_id, "channel id");
  assertSafeSlug(post.author, "forum post author");
  assertForumTitle(post.title);
  assertForumBody(post.body);
  parseForumStatus(post.status);
  normalizeForumTags(post.tags);
}

export function assertValidForumComment(comment: ForumComment): void {
  assertSchemaVersion(comment.schema_version, "forum comment");
  assertSafeSlug(comment.id, "forum comment id");
  assertSafeSlug(comment.post_id, "forum post id");
  assertSafeSlug(comment.channel_id, "channel id");
  assertSafeSlug(comment.author, "forum comment author");
  if (comment.body.trim().length === 0) throw new Error("forum comment body is required");
  assertForumBody(comment.body);
}
