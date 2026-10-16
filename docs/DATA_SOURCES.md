# SGA Data-Source Registry

This document defines how SGA will evaluate and record sources. Candidate games must not be treated as confirmed active games until their current status and evidence are checked.

## Source tiers

### Tier 1 — Direct, game-specific evidence
Examples: an official game API, public leaderboard, official player statistics, or a documented public match-history endpoint.

Use this tier for player or gameplay metrics only when definitions, coverage, and update frequency are clear.

### Tier 2 — On-chain evidence
Public Steem blockchain data accessed through documented read-only API methods. This can support counts of posts, authors, comments, and other on-chain engagement signals.

It does **not** automatically establish actual gameplay or unique player counts.

### Tier 3 — Discovery and context
Official project websites, game documentation, public community pages, and maintained directories. Use these to identify games, tags, and source endpoints; do not use them as numerical evidence unless they publish defined metrics.

## Initial technical source

- **Steem Developer — Condenser API definitions:** https://developers.steem.io/apidefinitions/condenser-api
- Candidate methods include `condenser_api.get_discussions_by_created` for time-ordered post discovery and `condenser_api.get_content` for retrieving an individual post.
- A public API endpoint such as `https://api.steemit.com` may be tested during implementation. Endpoint health and response consistency must be checked during each run.

## Registry fields

Each game/source entry should record:

- Game name and current status
- Official website or authoritative project source
- Steem community and candidate tags
- Direct game-data endpoint, if available
- Evidence tier
- Metrics supported by the source
- Known coverage gaps and rate limits
- Date last verified
- Verification notes

## Candidate discovery workflow

1. Search current Steem gaming communities and recent posts.
2. Compile candidate games from repeated, attributable mentions and authoritative game sources.
3. Verify whether each game is active, inactive, or uncertain.
4. Check for a direct game-specific data source.
5. Record candidate Steem tags and test whether they retrieve relevant recent content.
6. Include only sources with documented provenance in automated reports.

## Evidence labels

- **Verified:** supported by a direct, authoritative source with a clear metric definition.
- **Observed:** directly counted from public Steem content or blockchain data.
- **Estimated:** calculated from stated assumptions; assumptions must be visible.
- **Unknown:** no reliable source found.
- **Unverified candidate:** discovered but not yet checked.

Never present Observed or Estimated content activity as Verified gameplay activity.
