// File-backed forum storage (#150 / T6).
//
// Host-owned files are the single source of truth. Layout under the room dir:
//   forum/<channelId>/<postId>/post.json     (ForumPost — metadata + Markdown body)
//   forum/<channelId>/<postId>/comments.jsonl (append-only ForumComment log)
// All writes go through the existing room writer lock with atomic, 0600 secure
// writes; there is no central/cloud body storage and no duplicated storage. The
// Markdown body is stored raw (like the brief) and rendered by the existing safe
// renderer downstream (T8) — no new injection surface at the storage layer.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  type ForumComment,
  type ForumPost,
  type ForumPostStatus,
  DEFAULT_FORUM_POST_STATUS,
  FORUM_SCHEMA_VERSION,
  assertForumBody,
  assertForumTitle,
  assertValidForumComment,
  assertValidForumPost,
  normalizeForumTags,
  parseForumStatus
} from "../protocol/forum.js";
import { assertSafeSlug } from "../protocol/validation.js";
import { readBoardroom } from "./boardroom-store.js";
import { withWriterLock } from "./lock.js";
import { roomPaths } from "./paths.js";
import { appendSecureFile, ensureSecureDir, writeSecureFile } from "./secure-fs.js";

export interface CreateForumPostInput {
  author: string;
  title: string;
  body: string;
  id?: string;
  status?: ForumPostStatus;
  tags?: string[];
}

export interface ForumPostThread {
  post: ForumPost;
  comments: ForumComment[];
}

export async function createForumPost(
  root: string,
  roomId: string,
  channelId: string,
  input: CreateForumPostInput,
  now: Date = new Date()
): Promise<ForumPost> {
  assertSafeSlug(channelId, "channel id");
  assertSafeSlug(input.author, "forum post author");
  assertForumTitle(input.title);
  assertForumBody(input.body);
  await assertForumChannel(root, roomId, channelId);

  const id = input.id ?? `post-${randomBytes(6).toString("hex")}`;
  assertSafeSlug(id, "forum post id");
  const iso = now.toISOString();
  const post: ForumPost = {
    schema_version: FORUM_SCHEMA_VERSION,
    id,
    channel_id: channelId,
    author: input.author,
    title: input.title,
    body: input.body,
    status: input.status ?? DEFAULT_FORUM_POST_STATUS,
    tags: normalizeForumTags(input.tags ?? []),
    created_at: iso,
    updated_at: iso
  };
  assertValidForumPost(post);

  const paths = roomPaths(root, roomId);
  return withWriterLock(paths.lock, async () => {
    await writeJsonNew(postFile(root, roomId, channelId, id), post); // wx: fails if the post id exists
    return post;
  });
}

export async function readForumPost(
  root: string,
  roomId: string,
  channelId: string,
  postId: string
): Promise<ForumPostThread> {
  assertSafeSlug(channelId, "channel id");
  assertSafeSlug(postId, "forum post id");
  const post = await readJson<ForumPost>(postFile(root, roomId, channelId, postId));
  const comments = await readCommentsLog(root, roomId, channelId, postId);
  return { post, comments };
}

export async function listForumPosts(root: string, roomId: string, channelId: string): Promise<ForumPost[]> {
  assertSafeSlug(channelId, "channel id");
  const dir = channelDir(root, roomId, channelId);
  let entries: string[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
  const posts: ForumPost[] = [];
  for (const postId of entries) {
    try {
      posts.push(await readJson<ForumPost>(postFile(root, roomId, channelId, postId)));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  return posts.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function addForumComment(
  root: string,
  roomId: string,
  channelId: string,
  postId: string,
  input: { author: string; body: string },
  now: Date = new Date()
): Promise<ForumComment> {
  assertSafeSlug(channelId, "channel id");
  assertSafeSlug(postId, "forum post id");
  assertSafeSlug(input.author, "forum comment author");
  assertForumBody(input.body);
  const paths = roomPaths(root, roomId);
  return withWriterLock(paths.lock, async () => {
    // Post must exist (also confirms the channel/post path).
    await readJson<ForumPost>(postFile(root, roomId, channelId, postId));
    const existing = await readCommentsLog(root, roomId, channelId, postId);
    const comment: ForumComment = {
      schema_version: FORUM_SCHEMA_VERSION,
      id: `c${existing.length + 1}`,
      post_id: postId,
      channel_id: channelId,
      author: input.author,
      body: input.body,
      created_at: now.toISOString()
    };
    assertValidForumComment(comment);
    await appendSecureFile(commentsFile(root, roomId, channelId, postId), `${JSON.stringify(comment)}\n`);
    return comment;
  });
}

export async function setForumPostStatus(
  root: string,
  roomId: string,
  channelId: string,
  postId: string,
  status: ForumPostStatus,
  now: Date = new Date()
): Promise<ForumPost> {
  assertSafeSlug(channelId, "channel id");
  assertSafeSlug(postId, "forum post id");
  parseForumStatus(status);
  const paths = roomPaths(root, roomId);
  return withWriterLock(paths.lock, async () => {
    const post = await readJson<ForumPost>(postFile(root, roomId, channelId, postId));
    const updated: ForumPost = { ...post, status, updated_at: now.toISOString() };
    assertValidForumPost(updated);
    await writeJson(postFile(root, roomId, channelId, postId), updated);
    return updated;
  });
}

async function assertForumChannel(root: string, roomId: string, channelId: string): Promise<void> {
  const boardroom = await readBoardroom(root, roomId);
  const channel = boardroom.channels.find((c) => c.id === channelId);
  if (channel === undefined) throw new Error(`channel not found: ${channelId}`);
  if (channel.type !== "forum") throw new Error(`channel ${channelId} is not a forum channel`);
}

function channelDir(root: string, roomId: string, channelId: string): string {
  return path.join(roomPaths(root, roomId).room, "forum", channelId);
}
function postFile(root: string, roomId: string, channelId: string, postId: string): string {
  return path.join(channelDir(root, roomId, channelId), postId, "post.json");
}
function commentsFile(root: string, roomId: string, channelId: string, postId: string): string {
  return path.join(channelDir(root, roomId, channelId), postId, "comments.jsonl");
}

async function readCommentsLog(root: string, roomId: string, channelId: string, postId: string): Promise<ForumComment[]> {
  try {
    const raw = await readFile(commentsFile(root, roomId, channelId, postId), "utf8");
    return raw
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as ForumComment);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}
async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureSecureDir(path.dirname(file));
  await writeSecureFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeJsonNew(file: string, value: unknown): Promise<void> {
  await ensureSecureDir(path.dirname(file));
  await writeSecureFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
