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

## Repository layout

- `docs/` — research, definitions, and reporting standards
- `data/` — curated configuration and source registry
- `scripts/` — collection and analysis code (to be added after the research phase)
- `.github/workflows/` — scheduled automation (to be added after validation)
- `reports/` — generated reports

## Primary technical reference

The Steem Developer documentation describes the public Condenser API methods used to query posts, including `condenser_api.get_discussions_by_created`: https://developers.steem.io/apidefinitions/condenser-api
