# Data Directory

This directory contains the SGA's source-controlled data library.

## Files

- `games.json`: canonical game directory, known tags, source links, and verification notes.
- `aliases.json`: general discovery tags and verified alternate names or tags.
- `snapshots/YYYY-MM-DD.json`: dated, reproducible statistics snapshots (created by the collector when implemented).

## Update rules

1. Keep all keys, identifiers, and values in English.
2. Store tag values without a leading `#`; display layers may add it.
3. Use stable `game_id` values. Do not use a tag as the primary identifier because tags can change.
4. Record source URLs and verification status. A listed game or tag does not prove current activity.
5. Do not put calculated, time-varying metrics in `games.json`. Store them in dated snapshots.
6. Do not infer real player counts from posts or author counts.
7. Review proposed games and aliases before adding them to the canonical library.

## Editing and automation

Small corrections can be made through GitHub's file editor. Automation may update statistics and create snapshots using a GitHub Actions workflow with repository write permission. Keep game identity fields separate from calculated metrics and avoid overlapping write workflows.
