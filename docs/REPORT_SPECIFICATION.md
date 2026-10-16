# SGA Weekly Report Specification

## Title

`Steem Gaming Activity Report — YYYY-MM-DD to YYYY-MM-DD`

## Required header

- Reporting window (UTC)
- Generated at (UTC)
- SGA version or commit
- Collection status: complete, partial, or failed
- Sources and query rules used

## Sections

1. **Executive summary** — a short summary of the most important observed changes.
2. **Collection health** — endpoints checked, source coverage, errors, and limitations.
3. **Activity by game** — qualifying post count and distinct content authors, with source rules.
4. **Engagement signals** — comments and available vote/reward measures, clearly labeled.
5. **Trend comparison** — change versus the previous comparable window; include counts and percentages where calculable.
6. **Verified gameplay metrics** — include only if a game-specific source provides a reliable definition and data.
7. **Steem Flags growth opportunities** — specific, practical suggestions tied to observed evidence.
8. **Methodology and caveats** — definitions, tag bias, missing data, and known comparability limits.
9. **Source links** — links to APIs, communities, games, and representative public posts.

## Wording rules

- Say “content authors” when counting accounts that publish qualifying posts.
- Do not call content authors “players” unless a direct game source verifies player status.
- Label on-chain counts as observed.
- Label assumptions and estimates explicitly.
- Do not imply causation from week-over-week correlation.
- If a source failed, report “data unavailable” instead of zero.
- Keep recommendations proportional to the strength of the evidence.

## Review

The initial automated output is a draft. A human should review source validity, unexpected changes, and growth recommendations before any external publication.
