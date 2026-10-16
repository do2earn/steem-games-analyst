#!/usr/bin/env python3
"""Collect recent public Steem posts by game-specific tags and write dated JSON/Markdown reports."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_URL = os.environ.get("STEEM_API_URL", "https://api.steemit.com")
WINDOW_DAYS = int(os.environ.get("SGA_WINDOW_DAYS", "7"))
MAX_PAGES_PER_TAG = int(os.environ.get("SGA_MAX_PAGES_PER_TAG", "15"))
PAGE_SIZE = 100
TIMEOUT_SECONDS = 25


def rpc(method: str, params: list):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    request = urllib.request.Request(API_URL, data=body, headers={"Content-Type": "application/json", "User-Agent": "SteemGamesAnalyst/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("error"):
        raise RuntimeError(payload["error"].get("message", "Steem API returned an error"))
    return payload.get("result")


def fetch_tag_posts(tag: str, since: datetime, until: datetime) -> tuple[list[dict], dict]:
    found: dict[str, dict] = {}
    start_author = ""
    start_permlink = ""
    pages = 0
    reached_window_start = False
    for page in range(MAX_PAGES_PER_TAG):
        query = {"tag": tag, "limit": PAGE_SIZE}
        if start_author and start_permlink:
            query["start_author"] = start_author
            query["start_permlink"] = start_permlink
        posts = rpc("condenser_api.get_discussions_by_created", [query])
        pages += 1
        if not isinstance(posts, list) or not posts:
            reached_window_start = True
            break
        for post in posts:
            author = post.get("author", "")
            permlink = post.get("permlink", "")
            created_raw = post.get("created", "")
            if not author or not permlink or not created_raw:
                continue
            try:
                created = datetime.strptime(created_raw, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if created < since:
                reached_window_start = True
                break
            if created > until:
                continue
            key = f"{author}/{permlink}"
            metadata = {}
            try:
                metadata = json.loads(post.get("json_metadata") or "{}")
                if not isinstance(metadata, dict):
                    metadata = {}
            except (TypeError, json.JSONDecodeError):
                metadata = {}
            tags = metadata.get("tags", [])
            if not isinstance(tags, list):
                tags = []
            found[key] = {
                "author": author,
                "permlink": permlink,
                "title": post.get("title", ""),
                "created": created.isoformat().replace("+00:00", "Z"),
                "url": f"https://steemit.com/@{author}/{permlink}",
                "matched_tag": tag,
                "tags": [str(item) for item in tags],
                "net_votes": post.get("net_votes", 0),
                "children": post.get("children", 0),
                "pending_payout_value": post.get("pending_payout_value", "0.000 SBD"),
                "active_votes_count": len(post.get("active_votes", [])) if isinstance(post.get("active_votes"), list) else None,
            }
        if reached_window_start:
            break
        last = posts[-1]
        next_author, next_permlink = last.get("author", ""), last.get("permlink", "")
        if not next_author or not next_permlink or (next_author == start_author and next_permlink == start_permlink):
            break
        start_author, start_permlink = next_author, next_permlink
        time.sleep(0.15)
    return list(found.values()), {"pages_fetched": pages, "reached_window_start": reached_window_start, "page_limit_reached": pages >= MAX_PAGES_PER_TAG and not reached_window_start}


def main() -> int:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    since = now - timedelta(days=WINDOW_DAYS)
    library_path = ROOT / "data" / "games.json"
    library = json.loads(library_path.read_text(encoding="utf-8"))
    games = library.get("games", [])
    general_tags = library.get("general_tags", [])
    if not games:
        raise RuntimeError("The game library has no games.")

    tag_to_games: dict[str, list[dict]] = defaultdict(list)
    for game in games:
        for tag in game.get("tags", []):
            tag_to_games[str(tag).strip().lower()].append(game)
    tags_to_scan = sorted(set(tag_to_games) | {str(tag).strip().lower() for tag in general_tags if str(tag).strip()})
    all_posts: dict[str, dict] = {}
    tag_stats = {}
    errors = []
    for tag in tags_to_scan:
        try:
            posts, meta = fetch_tag_posts(tag, since, now)
            tag_stats[tag] = {"post_count": len(posts), "unique_authors": len({p["author"] for p in posts}), **meta, "status": "ok"}
            for post in posts:
                key = f'{post["author"]}/{post["permlink"]}'
                if key not in all_posts:
                    all_posts[key] = post
                all_posts[key]["matched_tags"] = sorted(set(all_posts[key].get("matched_tags", [])) | {tag})
        except Exception as exc:
            print(f"Tag query failed for #{tag}: {exc}", file=sys.stderr)
            tag_stats[tag] = {"status": "error", "error": str(exc)}
            errors.append({"tag": tag, "error": str(exc)})

    # Do not publish a misleading zero-report when every API query failed.
    successful_tags = [tag for tag, item in tag_stats.items() if item.get("status") == "ok"]
    if not successful_tags:
        raise RuntimeError("All tag queries failed; refusing to write a misleading empty snapshot.")

    per_game = []
    for game in games:
        game_tags = [str(t).strip().lower() for t in game.get("tags", [])]
        selected = {}
        for post_key, post in all_posts.items():
            if set(post.get("matched_tags", [])) & set(game_tags):
                selected[post_key] = post
        authors = sorted({post["author"] for post in selected.values()})
        per_game.append({
            "game_id": game.get("game_id"),
            "game_name": game.get("game_name", game.get("game_id")),
            "tags": game_tags,
            "game_url": game.get("game_url"),
            "posts_found": len(selected),
            "unique_authors": len(authors),
            "authors": authors,
            "posts": sorted(selected.values(), key=lambda p: p["created"], reverse=True),
            "query_status": "ok" if any(tag_stats.get(t, {}).get("status") == "ok" for t in game_tags) else "error",
        })

    snapshot = {
        "schema_version": 1,
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "window": {"start": since.isoformat().replace("+00:00", "Z"), "end": now.isoformat().replace("+00:00", "Z"), "days": WINDOW_DAYS},
        "api_endpoint": API_URL,
        "method": "condenser_api.get_discussions_by_created",
        "coverage_note": "Counts reflect posts returned by the public API for configured tags within the reporting window. They are not a complete census of all Steem posts or verified gameplay/player counts. Per-tag page limits and API errors may reduce coverage.",
        "game_count": len(games),
        "tags_scanned": tags_to_scan,
        "tag_stats": tag_stats,
        "games": per_game,
        "discovery_candidates": [
            post for post in sorted(all_posts.values(), key=lambda p: p["created"], reverse=True)
            if set(post.get("matched_tags", [])) & {str(t).strip().lower() for t in general_tags}
            and not any(set(post.get("matched_tags", [])) & set(game.get("tags", [])) for game in games)
        ],
        "api_errors": errors,
    }

    date_key = now.strftime("%Y-%m-%d")
    snapshots_dir = ROOT / "data" / "snapshots"
    reports_dir = ROOT / "reports"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = snapshots_dir / f"{date_key}.json"
    snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        f"# Steem Games Activity Report — {date_key}", "",
        f"- Generated at: {snapshot['generated_at']}",
        f"- Reporting window: {snapshot['window']['start']} to {snapshot['window']['end']} ({WINDOW_DAYS} days)",
        f"- Games in directory: {len(games)}",
        f"- Unique posts across scanned tags: {len(all_posts)}",
        f"- Tags queried successfully: {len(successful_tags)}/{len(tags_to_scan)}",
        f"- API endpoint: {API_URL}", "",
        "> Coverage limitation: these are public API results for configured tags, not verified player counts or a complete census of Steem gaming activity. A post mentioning a game does not prove that its author played it.", "",
        "## Game activity", "",
        "| Game | Dedicated tags | Posts found | Unique authors | Query status |",
        "|---|---|---:|---:|---|",
    ]
    for game in per_game:
        lines.append(f"| {game['game_name']} | {', '.join('#' + tag for tag in game['tags'])} | {game['posts_found']} | {game['unique_authors']} | {game['query_status']} |")
    lines += ["", "## Tag query results", "", "| Tag | Posts | Unique authors | Pages | Status |", "|---|---:|---:|---:|---|"]
    for tag in tags_to_scan:
        info = tag_stats.get(tag, {})
        lines.append(f"| #{tag} | {info.get('post_count', '—')} | {info.get('unique_authors', '—')} | {info.get('pages_fetched', '—')} | {info.get('status', 'error')} |")
    lines += ["", "## Discovery candidates", "", f"Posts found via the general tag that did not match a currently listed dedicated game tag: **{len(snapshot['discovery_candidates'])}**.", ""]
    if snapshot["discovery_candidates"]:
        lines += ["| Post | Published (UTC) | Matched tags |", "|---|---|---|"]
        for post in snapshot["discovery_candidates"][:50]:
            lines.append(f"| [{post['title'] or post['author'] + '/' + post['permlink']}]({post['url']}) | {post['created']} | {', '.join('#' + t for t in post.get('matched_tags', []))} |")
    if errors:
        lines += ["", "## API errors", ""]
        lines += [f"- **#{item['tag']}**: {item['error']}" for item in errors]
    lines += ["", f"Raw snapshot: [data/snapshots/{date_key}.json](../data/snapshots/{date_key}.json)", ""]
    (reports_dir / f"{date_key}.md").write_text("\n".join(lines), encoding="utf-8")
    (reports_dir / "latest.json").write_text(json.dumps({"date": date_key, "report": f"{date_key}.md", "snapshot": f"../data/snapshots/{date_key}.json", "generated_at": snapshot["generated_at"]}, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {snapshot_path.relative_to(ROOT)} and reports/{date_key}.md; {len(all_posts)} unique posts, {len(errors)} tag errors.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"SGA collection failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
