# SGA Scripts

Data collection, validation, snapshot generation, and report generation scripts will live here.

Implementation rules:
- Read the canonical game and tag registry from `data/games.json` and `data/aliases.json`.
- Use documented read-only Steem API methods for public data collection.
- Validate JSON and deduplicate posts by author and permlink.
- Record partial failures and coverage gaps.
- Never label content authors as players unless a game-specific source verifies player status.
- Keep scripts and comments in English.

No collector is enabled by this directory placeholder alone.
