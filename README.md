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

**Initial collector run succeeded.** The browser dashboard, public-tag collector, daily GitHub Actions workflow, and GitHub Pages deployment workflow are in the repository. The first report was generated successfully on 2026-10-16. Pages deployment is currently blocked because GitHub Pages has not yet been enabled in repository Settings.

## Planned outputs

- Game directory and evidence notes
- Activity data-source registry
- Analytics framework
- Weekly report specification
- Automated collection and English-language reports

## Running the collector

The workflow `SGA - Collect Steem Game Statistics` can run daily or be started manually from the GitHub Actions tab. It queries the configured dedicated tags in `data/games.json` and the general discovery tag in `data/aliases.json`/the game library, then commits a dated JSON snapshot and Markdown report. It is read-only against Steem and does not need a private key. API errors and page limits are recorded; an all-failed run does not create a misleading empty report.

The `Deploy SGA to GitHub Pages` workflow publishes the static dashboard. Before the first deployment, open repository **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The workflow token cannot create the Pages site in this repository until Pages has been enabled through Settings. After saving, rerun the Pages workflow from **Actions → Deploy SGA to GitHub Pages → Run workflow**. The expected project URL is `https://do2earn.github.io/steem-games-analyst/`; it becomes live only after a successful deployment. The dashboard reads its game directory and latest-report pointer from the published repository files.

## Language and publishing

All repository content, code comments, configuration descriptions, logs, and generated reports are written in English. Reports should include the reporting window, collection time, methods, source links, limitations, and reproducible counts.

## Access and authentication

The initial web interface is intended for `@do2earn` only. It fixes the username and checks the supplied Posting Key against the account's public posting authority. The key is held in browser memory for the active page session and is not stored in local/session storage, repository files, or a SGA backend. The key is used only for verification; SGA does not sign or broadcast transactions.

**Security limitation:** this is a client-side access gate, not strong server-enforced authorization. Because the initial app is static and its files are public, a technically skilled visitor could bypass the interface. Do not treat it as protection for confidential data or privileged server actions. Strong enforcement would require a trusted backend or another server-side authorization layer.

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
