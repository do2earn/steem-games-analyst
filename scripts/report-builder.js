(() => {
  "use strict";
  const API_URL = "https://api.steemit.com";
  const WINDOW_DAYS = 7;
  const PAGE_SIZE = 100;
  const MAX_PAGES_PER_TAG = 15;
  const $ = id => document.getElementById(id);
  const createBtn = $("createReportBtn");
  const copyBtn = $("copyHtmlBtn");
  const previewBtn = $("previewHtmlBtn");
  const editor = $("reportHtmlEditor");
  const preview = $("reportPreview");
  const progressWrap = $("reportProgressWrap");
  const progressBar = $("reportProgress");
  const progressPercent = $("reportProgressPercent");
  const progressLabel = $("reportProgressLabel");
  const reportStatus = $("createReportStatus");
  let latestGeneratedHtml = "";

  function setProgress(percent, label, className = "") {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
    progressWrap.hidden = false;
    progressBar.value = safePercent;
    progressPercent.textContent = safePercent + "%";
    progressLabel.textContent = label;
    reportStatus.className = "status " + className;
    reportStatus.textContent = label;
  }

  async function rpc(method, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({jsonrpc: "2.0", method, params, id: 1}),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Steem API HTTP " + response.status);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || "Steem API error");
      return payload.result;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Steem API request timed out");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function parseCreated(value) {
    if (!value) return null;
    const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : value + "Z";
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function utcStamp(date) {
    return date ? date.toISOString().replace(".000Z", "Z") : "";
  }

  async function fetchTagPosts(tag, since, until, onPage) {
    const found = new Map();
    let startAuthor = "";
    let startPermlink = "";
    let reachedWindowStart = false;
    let pagesFetched = 0;
    for (let page = 1; page <= MAX_PAGES_PER_TAG; page++) {
      const query = {tag, limit: PAGE_SIZE};
      if (startAuthor && startPermlink) {
        query.start_author = startAuthor;
        query.start_permlink = startPermlink;
      }
      const posts = await rpc("condenser_api.get_discussions_by_created", [query]);
      pagesFetched = page;
      if (!Array.isArray(posts) || posts.length === 0) {
        reachedWindowStart = true;
        break;
      }
      for (const post of posts) {
        const author = post && post.author;
        const permlink = post && post.permlink;
        const created = parseCreated(post && post.created);
        if (!author || !permlink || !created) continue;
        if (created < since) {
          reachedWindowStart = true;
          break;
        }
        if (created > until) continue;
        const key = author + "/" + permlink;
        let metadata = {};
        try {
          metadata = JSON.parse(post.json_metadata || "{}");
          if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) metadata = {};
        } catch (_) { metadata = {}; }
        const tags = Array.isArray(metadata.tags) ? metadata.tags.map(String) : [];
        const prior = found.get(key);
        found.set(key, {
          author, permlink, title: post.title || "", created: utcStamp(created),
          url: "https://steemit.com/@" + encodeURIComponent(author) + "/" + encodeURIComponent(permlink),
          tags: Array.from(new Set([...(prior ? prior.tags : []), ...tags])),
          matchedTags: Array.from(new Set([...(prior ? prior.matchedTags : []), tag]))
        });
      }
      if (typeof onPage === "function") onPage(page);
      if (reachedWindowStart) break;
      const last = posts[posts.length - 1];
      const nextAuthor = last && last.author;
      const nextPermlink = last && last.permlink;
      if (!nextAuthor || !nextPermlink || (nextAuthor === startAuthor && nextPermlink === startPermlink)) break;
      startAuthor = nextAuthor;
      startPermlink = nextPermlink;
      if (page < MAX_PAGES_PER_TAG) await new Promise(resolve => setTimeout(resolve, 100));
    }
    return {
      posts: Array.from(found.values()),
      pagesFetched,
      reachedWindowStart,
      pageLimitReached: pagesFetched >= MAX_PAGES_PER_TAG && !reachedWindowStart
    };
  }

  function buildReportHtml(games, tagStats, allPosts, windowStart, windowEnd, errors, tagsScanned) {
    const uniquePosts = Array.from(allPosts.values()).sort((a, b) => b.created.localeCompare(a.created));
    const generalTags = new Set(tagsScanned.general);
    const gameTags = new Set(games.flatMap(game => (game.tags || []).map(tag => String(tag).trim().toLowerCase())));
    const candidates = uniquePosts.filter(post =>
      post.matchedTags.some(tag => generalTags.has(tag)) &&
      !post.matchedTags.some(tag => gameTags.has(tag))
    );
    const rows = games.map(game => {
      const ownTags = (game.tags || []).map(tag => String(tag).trim().toLowerCase());
      const ownTagSet = new Set(ownTags);
      const posts = uniquePosts.filter(post => post.matchedTags.some(tag => ownTagSet.has(tag)));
      const statuses = ownTags.map(tag => tagStats[tag] && tagStats[tag].status);
      const successCount = statuses.filter(value => value === "ok").length;
      const errorCount = statuses.filter(value => value === "error").length;
      const queryStatus = errorCount === 0 ? "Complete" : (successCount > 0 ? "Partial" : "Failed");
      const authors = new Set(posts.map(post => post.author));
      const last = posts.reduce((latest, post) => !latest || post.created > latest ? post.created : latest, "");
      const countPrefix = queryStatus === "Partial" ? "≥" : "";
      const countText = queryStatus === "Failed" ? "—" : countPrefix + posts.length;
      const authorText = queryStatus === "Failed" ? "—" : countPrefix + authors.size;
      const name = escapeHtml(game.game_name || game.game_id || "Unknown game");
      const gameUrl = typeof game.game_url === "string" && /^https:\/\//i.test(game.game_url) ? game.game_url : "";
      const linkedName = gameUrl ? '<a href="' + escapeHtml(gameUrl) + '">' + name + '</a>' : name;
      const tagText = ownTags.map(tag => "#" + escapeHtml(tag)).join(", ") || "—";
      const lastText = last ? escapeHtml(last.replace("T", " ").replace("Z", " UTC")) : "—";
      return "<tr><td>" + linkedName + "</td><td>" + tagText + "</td><td>" + countText + "</td><td>" + authorText + "</td><td>" + lastText + "</td><td>" + queryStatus + "</td></tr>";
    }).join("\n");
    const tagRows = Object.keys(tagStats).sort().map(tag => {
      const info = tagStats[tag];
      return "<tr><td>#" + escapeHtml(tag) + "</td><td>" + (info.status === "ok" ? info.post_count : "—") + "</td><td>" + (info.status === "ok" ? info.unique_authors : "—") + "</td><td>" + (info.pages_fetched ?? "—") + "</td><td>" + escapeHtml(info.status === "ok" ? (info.page_limit_reached ? "Limit reached" : "OK") : "Error: " + info.error) + "</td></tr>";
    }).join("\n");
    const candidateRows = candidates.slice(0, 30).map(post =>
      '<tr><td><a href="' + escapeHtml(post.url) + '">' + escapeHtml(post.title || post.author + "/" + post.permlink) + '</a></td><td>' +
      escapeHtml(post.created.replace("T", " ").replace("Z", " UTC")) + "</td><td>" +
      post.matchedTags.map(tag => "#" + escapeHtml(tag)).join(", ") + "</td></tr>"
    ).join("\n");
    const windowText = windowStart.toISOString().replace(".000Z", "Z") + " to " + windowEnd.toISOString().replace(".000Z", "Z");
    const tagSuccesses = Object.values(tagStats).filter(item => item.status === "ok").length;
    const totalTagCount = Object.keys(tagStats).length;
    const coverage = "This report counts public API posts matching the configured tags. It is not a complete census of Steem gaming content and does not verify actual gameplay or real player counts. Tag-query page limits and API errors may reduce coverage.";
    const errorSection = errors.length ? '<h2>API errors</h2><ul>' + errors.map(item => "<li><strong>#" + escapeHtml(item.tag) + ":</strong> " + escapeHtml(item.error) + "</li>").join("") + "</ul>" : "";
    return '<h1>Steem Games Activity Report</h1>\n' +
      '<p><strong>Generated:</strong> ' + escapeHtml(windowEnd.toISOString().replace(".000Z", "Z")) + '<br>' +
      '<strong>Reporting window (UTC):</strong> ' + escapeHtml(windowText) + '<br>' +
      '<strong>Games in directory:</strong> ' + games.length + '<br>' +
      '<strong>Unique posts across scanned tags:</strong> ' + uniquePosts.length + '<br>' +
      '<strong>Successful tag queries:</strong> ' + tagSuccesses + "/" + totalTagCount + '</p>\n' +
      '<p><em>' + escapeHtml(coverage) + '</em></p>\n' +
      '<h2>Game activity</h2>\n' +
      '<table><thead><tr><th>Game</th><th>Dedicated tags</th><th>Posts</th><th>Unique authors</th><th>Last activity (UTC)</th><th>Query status</th></tr></thead><tbody>' + rows + '</tbody></table>\n' +
      '<h2>Tag query results</h2><table><thead><tr><th>Tag</th><th>Posts</th><th>Unique authors</th><th>Pages</th><th>Status</th></tr></thead><tbody>' + tagRows + '</tbody></table>\n' +
      '<h2>Discovery candidates</h2><p>Posts found via a general discovery tag that did not match a configured game-specific tag: <strong>' + candidates.length + '</strong>. Showing up to 30.</p>' +
      (candidateRows ? '<table><thead><tr><th>Post</th><th>Published (UTC)</th><th>Matched tags</th></tr></thead><tbody>' + candidateRows + '</tbody></table>' : "<p>No discovery candidates were found in this window.</p>") +
      errorSection + '<p><strong>Data source:</strong> public Steem API · <strong>Method:</strong> condenser_api.get_discussions_by_created</p>';
  }

  function showPreview() {
    const html = editor.value.trim();
    if (!html) {
      setProgress(progressBar.value, "Generate a report before previewing it.", "warn");
      return;
    }
    preview.srcdoc = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font:15px/1.5 Arial,sans-serif;color:#182434;padding:12px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0;display:block;overflow-x:auto}th,td{border:1px solid #b7c5d5;padding:7px;text-align:left;vertical-align:top}th{background:#eaf0f7}h1{font-size:23px}h2{font-size:18px;margin-top:24px}a{color:#175bb5}p{overflow-wrap:anywhere}</style></head><body>" + html + "</body></html>";
    preview.hidden = false;
    previewBtn.textContent = "Preview Updated HTML";
  }

  createBtn.addEventListener("click", async () => {
    createBtn.disabled = true;
    copyBtn.disabled = true;
    previewBtn.disabled = true;
    $("reportEditorSection").hidden = true;
    preview.hidden = true;
    editor.value = "";
    progressWrap.hidden = false;
    progressBar.value = 0;
    progressPercent.textContent = "0%";
    setProgress(2, "Loading the game directory and tag configuration…");
    try {
      const [gamesResponse, aliasesResponse] = await Promise.all([
        fetch("data/games.json", {cache: "no-store"}),
        fetch("data/aliases.json", {cache: "no-store"})
      ]);
      if (!gamesResponse.ok) throw new Error("Could not load data/games.json (HTTP " + gamesResponse.status + ").");
      const library = await gamesResponse.json();
      const games = Array.isArray(library.games) ? library.games : [];
      if (!games.length) throw new Error("The game directory is empty.");
      let aliases = {};
      if (aliasesResponse.ok) aliases = await aliasesResponse.json();
      const generalTags = new Set((Array.isArray(library.general_tags) ? library.general_tags : []).map(item => typeof item === "string" ? item : item && item.tag).filter(Boolean).map(tag => String(tag).trim().toLowerCase()));
      for (const item of (Array.isArray(aliases.general_tags) ? aliases.general_tags : [])) {
        const tag = typeof item === "string" ? item : item && item.tag;
        if (tag) generalTags.add(String(tag).trim().toLowerCase());
      }
      const tagToGames = new Map();
      for (const game of games) {
        for (const rawTag of (Array.isArray(game.tags) ? game.tags : [])) {
          const tag = String(rawTag).trim().toLowerCase();
          if (!tag) continue;
          if (!tagToGames.has(tag)) tagToGames.set(tag, []);
          tagToGames.get(tag).push(game.game_id);
        }
      }
      const allTags = Array.from(new Set([...tagToGames.keys(), ...generalTags])).sort();
      if (!allTags.length) throw new Error("No tags are configured for scanning.");
      const until = new Date();
      const since = new Date(until.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const tagStats = {};
      const allPosts = new Map();
      const errors = [];
      setProgress(4, "Ready to scan " + allTags.length + " configured tags.");
      for (let index = 0; index < allTags.length; index++) {
        const tag = allTags[index];
        const base = 5 + (index / allTags.length) * 70;
        const next = 5 + ((index + 1) / allTags.length) * 70;
        setProgress(base, "Scanning #" + tag + " (" + (index + 1) + "/" + allTags.length + ")…");
        try {
          const result = await fetchTagPosts(tag, since, until);
          const posts = result.posts;
          tagStats[tag] = {
            status: "ok",
            post_count: posts.length,
            unique_authors: new Set(posts.map(post => post.author)).size,
            pages_fetched: result.pagesFetched,
            page_limit_reached: result.pageLimitReached
          };
          for (const post of posts) {
            const key = post.author + "/" + post.permlink;
            const previous = allPosts.get(key);
            allPosts.set(key, previous ? {
              ...previous,
              matchedTags: Array.from(new Set([...previous.matchedTags, ...post.matchedTags])),
              tags: Array.from(new Set([...previous.tags, ...post.tags]))
            } : post);
          }
        } catch (error) {
          const message = error && error.message ? error.message : "Unknown API error";
          tagStats[tag] = {status: "error", error: message, pages_fetched: 0};
          errors.push({tag, error: message});
        }
        setProgress(next, "Scanned " + (index + 1) + "/" + allTags.length + " tags; latest: #" + tag + ".");
      }
      const successes = Object.values(tagStats).filter(item => item.status === "ok").length;
      if (!successes) throw new Error("All tag queries failed. No report was generated; check the API connection and try again.");
      setProgress(80, "Analyzing unique posts, authors, and last activity…");
      await new Promise(resolve => setTimeout(resolve, 30));
      setProgress(88, "Building the game activity table and tag diagnostics…");
      await new Promise(resolve => setTimeout(resolve, 30));
      const reportHtml = buildReportHtml(games, tagStats, allPosts, since, until, errors, {general: Array.from(generalTags)});
      setProgress(96, "Preparing the HTML editor…");
      editor.value = reportHtml;
      latestGeneratedHtml = reportHtml;
      $("reportEditorSection").hidden = false;
      copyBtn.disabled = false;
      previewBtn.disabled = false;
      setProgress(100, "Report ready. Review or edit the HTML, then select Preview.", errors.length ? "warn" : "ok");
      $("reportResultSummary").textContent = allPosts.size + " unique posts · " + successes + "/" + allTags.length + " tag queries successful · " + errors.length + " errors";
    } catch (error) {
      setProgress(progressBar.value, error && error.message ? error.message : "Report generation failed.", "error");
    } finally {
      createBtn.disabled = false;
    }
  });

  previewBtn.addEventListener("click", showPreview);
  editor.addEventListener("input", () => {
    copyBtn.disabled = !editor.value.trim();
    previewBtn.disabled = !editor.value.trim();
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(editor.value);
      setProgress(progressBar.value, "HTML copied to clipboard.", "ok");
    } catch (_) {
      editor.focus();
      editor.select();
      const copied = document.execCommand("copy");
      setProgress(progressBar.value, copied ? "HTML copied to clipboard." : "Select and copy the HTML manually.", copied ? "ok" : "warn");
    }
  });
})();