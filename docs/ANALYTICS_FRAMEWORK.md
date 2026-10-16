# SGA Analytics Framework

## Reporting window

Use explicit UTC timestamps for all collection windows. Weekly reports should compare equivalent seven-day windows and state the exact start and end times.

## Unit of analysis

The primary unit is a qualifying top-level Steem post, deduplicated by author and permlink. Comments can be counted separately as engagement, but must not be mixed with post totals.

## Core definitions

- **Qualifying post:** a public top-level post matched by a documented game tag, community, or curated source rule.
- **Distinct content author:** a unique Steem account with at least one qualifying post in the reporting window.
- **Posts per author:** qualifying post count divided by distinct content authors; report as not applicable when the denominator is zero.
- **Comment count:** comments associated with qualifying posts, where collection coverage is sufficient.
- **Vote/reward signal:** public vote or payout fields available from the source, with snapshot time stated. These are engagement/economic signals, not gameplay counts.
- **Verified active player:** count reported by a reliable game-specific source with a documented definition and time window.
- **Coverage rate:** successfully processed records divided by records discovered or expected, where both values are known.

## Comparability rules

- Compare the same game, source rules, and window length across periods.
- Deduplicate posts discovered through multiple tags or feeds.
- Keep game-specific metrics separate unless their definitions are demonstrably equivalent.
- Mark tag or source changes as a methodology break.
- Do not rank games by a single composite score until metric coverage and weighting have been validated.

## Recommended first report tables

1. Collection health and source coverage
2. Gaming content activity by game/source rule
3. Distinct content authors by game/source rule
4. Engagement signals, where comparable
5. Week-over-week changes with sample sizes
6. Data gaps, caveats, and next verification tasks
7. Evidence-backed opportunities relevant to Steem Flags

## Quality checks

- Validate timestamps and normalize to UTC.
- Ignore replies when calculating top-level post counts.
- Deduplicate by author plus permlink.
- Detect API errors, truncated pagination, and empty responses.
- Treat failed collection as missing data, not as zero activity.
- Preserve the source URL and query configuration for every report.
