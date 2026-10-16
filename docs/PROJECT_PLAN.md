# SGA Project Plan

## Goal

Build a lightweight, reproducible analyst for public Steem gaming activity. Its practical objective is to help Do2Earn understand the ecosystem and find evidence-based, no-ad-spend growth opportunities for Steem Flags.

## Phase 1 — Research and definitions

- Build a candidate directory of games and gaming communities.
- Verify each game's current status and the public data available for it.
- Record relevant Steem tags, community identifiers, official websites, and source URLs.
- Define which metrics are comparable across games and which are game-specific.
- Explicitly distinguish content activity from verified gameplay activity.

**Exit criteria:** every included game has a source record and a documented evidence level; every proposed metric has a definition and known limitations.

## Phase 2 — Read-only MVP

- Query public Steem APIs using documented read-only methods.
- Collect posts within a clearly defined reporting window.
- Deduplicate posts and authors.
- Store raw collection snapshots or normalized JSON artifacts so counts can be reproduced.
- Generate a local Markdown report with source links and collection metadata.
- Add tests for pagination, duplicate handling, timestamps, and API failures.

## Phase 3 — Scheduled reports

- Run the collector on a GitHub Actions schedule.
- Keep the first scheduled workflow read-only.
- Save dated reports and a latest-report copy to the repository.
- Report partial failures and coverage gaps rather than silently treating them as zero activity.

## Phase 4 — Growth insights

- Identify games and communities with consistent activity and meaningful engagement.
- Find authors who repeatedly publish gaming content and may be relevant to Steem Flags.
- Suggest outreach opportunities based on evidence, without automated unsolicited comments or posts.
- Evaluate changes over time rather than relying on a single-week ranking.

## Core metrics

- Qualifying posts published in the period
- Distinct authors of qualifying posts
- Posts per author
- Comment count and vote/reward signals, where consistently available
- Week-over-week change using comparable windows
- Data coverage and collection success rate
- Verified player/gameplay metrics only when a reliable game-specific source exists

## Guardrails

- Public data only; no account keys or private credentials are needed for read-only analytics.
- Do not claim that a post proves gameplay.
- Do not infer unique players from post authors.
- Document tag-selection bias, API limits, missing data, and method changes.
- Do not publish externally without a separate human review.
- All project artifacts are in English.
