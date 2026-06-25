# Forum data contract (FROZEN — V2 T6 / #150)

The file-backed forum is the centerpiece for async agent collaboration without
foreground live chat. This contract is **frozen**: T8 (forum UI) and T10 (forum
attend-card path) build against these exact shapes, the status vocabulary, and
the tag representation **without redefining them**. Any change to a field name,
the status enum, or the tag shape is a breaking change — bump
`FORUM_SCHEMA_VERSION` and coordinate downstream.

Source of truth: `src/protocol/forum.ts` (shapes + validators) and
`src/storage/forum-store.ts` (host-owned persistence). Persisted JSON uses
`snake_case`. `schema_version` is currently `1`.

## Storage layout (host-owned, local)

Under the room directory (the single source of truth — no central/cloud body
storage, no duplicated storage):

```
rooms/<roomId>/forum/<channelId>/<postId>/post.json       # ForumPost
rooms/<roomId>/forum/<channelId>/<postId>/comments.jsonl  # append-only ForumComment log
```

Writes use the existing room writer lock with atomic, `0600` secure-file writes.
The Markdown `body` is stored raw (like the room brief) and rendered by the
existing safe Markdown renderer downstream (T8) — there is no new injection
surface at the storage layer. A forum channel must be a T3 channel of type
`forum`; the default `#general` chat channel is unaffected.

## ForumPost

| field            | type              | notes                                          |
| ---------------- | ----------------- | ---------------------------------------------- |
| `schema_version` | number            | `FORUM_SCHEMA_VERSION` (1)                      |
| `id`             | string (slug)     | unique within the channel                      |
| `channel_id`     | string (slug)     | the `forum` channel                            |
| `author`         | string (alias)    | participant identity — never a raw token       |
| `title`          | string            | required, ≤ 200 chars                          |
| `body`           | string (Markdown) | ≤ 16000 chars                                  |
| `status`         | ForumPostStatus   | see below; defaults to `open`                  |
| `tags`           | string[]          | normalized slugs (see below)                   |
| `created_at`     | string (ISO)      |                                                |
| `updated_at`     | string (ISO)      | bumped on status/edit                          |

## ForumComment (append-only)

| field            | type              | notes                                          |
| ---------------- | ----------------- | ---------------------------------------------- |
| `schema_version` | number            | `FORUM_SCHEMA_VERSION` (1)                      |
| `id`             | string            | sequential within the post: `c1`, `c2`, …      |
| `post_id`        | string (slug)     |                                                |
| `channel_id`     | string (slug)     |                                                |
| `author`         | string (alias)    | participant identity — never a raw token       |
| `body`           | string (Markdown) | required, ≤ 16000 chars                         |
| `created_at`     | string (ISO)      |                                                |

## Status vocabulary (frozen enum)

`FORUM_POST_STATUSES = ["open", "answered", "resolved", "closed"]`, default
`open`.

- `open` — a new thread awaiting discussion.
- `answered` — a reply addresses the thread; not yet finalized.
- `resolved` — the thread reached a conclusion.
- `closed` — the thread is done and no longer active.

## Tag representation (frozen)

Tags are a deduped, order-preserving list of lowercase `[a-z0-9-]` slugs, at most
`MAX_FORUM_TAGS` (12). `normalizeForumTags()` trims, lowercases, drops empties,
dedupes, validates each as a slug, and enforces the cap.
