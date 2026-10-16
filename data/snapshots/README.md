# Historical Snapshots

Dated JSON snapshots will store computed statistics for a defined collection window.

Recommended filename: `YYYY-MM-DD.json`.

Each snapshot should record:
- collection timestamp in UTC;
- exact reporting-window start and end in UTC;
- source endpoints and query/tag rules;
- per-game observed post counts and distinct content-author counts;
- coverage, errors, and limitations;
- a schema version.

Snapshots are append-only historical records. Do not overwrite a previous date to silently change its results; document corrections explicitly.
