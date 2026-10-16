# Steem Games Analyst (SGA)

SGA is an independent project by Do2Earn for measuring activity across games and gaming communities on the Steem blockchain.

## Mission

- Track public gaming-related content and participation signals on Steem.
- Produce repeatable, source-linked statistical reports.
- Identify practical, evidence-based opportunities to grow Steem Flags organically.

## Measurement principles

SGA keeps different kinds of evidence separate:

1. **Content activity** — posts discovered through documented tags and community feeds.
2. **Content authors** — distinct accounts publishing qualifying posts during a reporting period.
3. **Verified game activity** — gameplay or player counts only when a game exposes a reliable, documented data source.
4. **Engagement signals** — comments, votes, and rewards, reported as platform signals rather than proof of actual gameplay.

A post about a game is not, by itself, proof that the author played it. SGA will label estimates and coverage gaps clearly and will not invent player counts.

## Project status

**Phase 1 — Research and measurement design.** The initial game directory, data-source registry, and metric definitions are being established before automation is enabled.

## Planned outputs

- Game directory and evidence notes
- Activity data-source registry
- Analytics framework
- Weekly report specification
- Automated collection and English-language reports

## Language and publishing

All repository content, code comments, configuration descriptions, logs, and generated reports are written in English. Reports should include the reporting window, collection time, methods, source links, limitations, and reproducible counts.

## Automation safety

The first automated runs should be read-only. Publishing reports externally will remain a separate, explicitly reviewed step.

## JSON-first data architecture

SGA starts without a database or Cloudflare dependency. GitHub is the source-controlled home for the canonical game library, discovery tags, dated statistics snapshots, and generated reports.

- `data/games.json` — canonical game directory, tags, source links, and verification notes
- `data/aliases.json` — general discovery tags and reviewed alternate tags/names
- `data/snapshots/` — dated statistics snapshots; historical records should not be silently overwritten
- `scripts/` — collection, validation, snapshot, and report-generation code (implementation follows the data model)
- `.github/workflows/` — scheduled automation to be enabled after the collector is validated
- `reports/` — generated English-language reports

Calculated metrics belong in snapshots, not in `games.json`. This keeps game identity and tags separate from changing statistics. A future GitHub Actions workflow may commit updated snapshots and reports with repository write permission. D1 and Cloudflare are not part of the initial architecture; reconsider a database only if repository-based storage becomes insufficient.

See `data/README.md` for the schema and update rules.

## Primary technical reference

The Steem Developer documentation describes the public Condenser API methods used to query posts, including `condenser_api.get_discussions_by_created`: https://developers.steem.io/apidefinitions/condenser-api
