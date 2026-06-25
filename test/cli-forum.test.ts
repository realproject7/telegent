import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import type { CliContext } from "../src/cli/context.js";
import { runRoomCommand } from "../src/cli/commands/room/index.js";
import type { ForumComment, ForumPost } from "../src/protocol/index.js";

class Capture extends Writable {
  chunks: string[] = [];
  _write(c: Buffer | string, _e: BufferEncoding, cb: (e?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(c) ? c.toString("utf8") : c);
    cb();
  }
  text(): string {
    return this.chunks.join("");
  }
  json<T>(): T {
    return JSON.parse(this.text()) as T;
  }
}

async function makeContext(): Promise<{ context: CliContext; stdout: Capture }> {
  const stdout = new Capture();
  const stderr = new Capture();
  return { context: { home: await mkdtemp(path.join(os.tmpdir(), "agentgather-t6cli-")), stdout, stderr }, stdout };
}

test("room forum-* CLI: host creates a post, a participant comments, list/read/status round-trip (token-free)", async () => {
  const { context, stdout } = await makeContext();
  await runRoomCommand(
    ["create-boardroom", "demo", "--channels", "general:chat,design-forum:forum", "--json"],
    context
  );

  stdout.chunks.length = 0;
  await runRoomCommand(
    ["forum-post", "design-forum", "--id", "rfc-1", "--title", "Adopt the kit", "--body", "Use it.", "--tags", "design,rfc", "--json"],
    context
  );
  const created = stdout.json<{ ok: true; post: ForumPost }>();
  assert.equal(created.post.id, "rfc-1");
  assert.equal(created.post.status, "open");
  assert.deepEqual(created.post.tags, ["design", "rfc"]);
  assert.equal(stdout.text().includes("tgl_"), false, "forum output must not leak a token");

  stdout.chunks.length = 0;
  await runRoomCommand(["forum-comment", "design-forum", "rfc-1", "--body", "looks good", "--json"], context);
  const comment = stdout.json<{ ok: true; comment: ForumComment }>();
  assert.equal(comment.comment.id, "c1");
  assert.equal(comment.comment.author, "host");

  stdout.chunks.length = 0;
  await runRoomCommand(["forum-status", "design-forum", "rfc-1", "--status", "resolved", "--json"], context);
  assert.equal(stdout.json<{ post: ForumPost }>().post.status, "resolved");

  stdout.chunks.length = 0;
  await runRoomCommand(["forum-list", "design-forum", "--json"], context);
  assert.equal(stdout.json<{ posts: ForumPost[] }>().posts.length, 1);

  stdout.chunks.length = 0;
  await runRoomCommand(["forum-read", "design-forum", "rfc-1", "--json"], context);
  const thread = stdout.json<{ post: ForumPost; comments: ForumComment[] }>();
  assert.equal(thread.post.status, "resolved");
  assert.equal(thread.comments.length, 1);
  assert.equal(thread.comments[0]?.body, "looks good");
});
