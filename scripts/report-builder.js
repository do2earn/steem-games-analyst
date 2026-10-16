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
    const uniquePosts = Array.from(allPosts.values());
    const generalTags = new Set(tagsScanned.general);
    const gameTags = new Set(games.flatMap(game => (game.tags || []).map(tag => String(tag).trim().toLowerCase())));
    const rows = games.map(game => {
      const ownTags = (game.tags || []).map(tag => String(tag).trim().toLowerCase());
      const ownTagSet = new Set(ownTags);
      const posts = uniquePosts.filter(post => post.matchedTags.some(tag => ownTagSet.has(tag)));
      const statuses = ownTags.map(tag => tagStats[tag] && tagStats[tag].status);
      const successCount = statuses.filter(value => value === "ok").length;
      const errorCount = statuses.filter(value => value === "error").length;
      const queryStatus = errorCount === 0 ? "Complete" : (successCount > 0 ? "Partial" : "Failed");
      const authors = new Set(posts.map(post => post.author));
      const countPrefix = queryStatus === "Partial" ? "≥" : "";
      const countText = queryStatus === "Failed" ? "—" : countPrefix + posts.length;
      const authorText = queryStatus === "Failed" ? "—" : countPrefix + authors.size;
      const name = escapeHtml(game.game_name || game.game_id || "Unknown game");
      const gameUrl = typeof game.game_url === "string" && /^https:\/\//i.test(game.game_url) ? game.game_url : "";
      const linkedName = gameUrl ? '<a href="' + escapeHtml(gameUrl) + '">' + name + '</a>' : name;
      const tagText = ownTags.map(tag => '<span class="sga-tag">#' + escapeHtml(tag) + '</span>').join(" ") || "—";
      const developer = String(game.developer || "").trim().replace(/^@/, "");
      const developerText = /^[a-z0-9.-]{3,16}$/.test(developer)
        ? '<a href="https://steemit.com/@' + encodeURIComponent(developer) + '">@' + escapeHtml(developer) + '</a>'
        : "—";
      return { gameName: String(game.game_name || game.game_id || "Unknown game"), posts: posts.length, authors: authors.size,
        failed: queryStatus === "Failed", countText, authorText,
        html: '<tr><td class="sga-no"></td><td class="sga-game">' + linkedName + '</td><td class="sga-number">' + countText + '</td><td class="sga-number">' + authorText + '</td><td>' + tagText + '</td><td>' + developerText + '</td></tr>' };
    }).sort((a, b) => { if (a.failed !== b.failed) return a.failed ? 1 : -1; return b.posts - a.posts || a.gameName.localeCompare(b.gameName); });
    rows.forEach((row, index) => { row.html = row.html.replace('<td class="sga-no"></td>', '<td class="sga-no">' + (index + 1) + '</td>'); });
    const tableRows = rows.map(row => row.html).join("\n");
    const monthName = windowEnd.toLocaleString("en-US", {month:"long", timeZone:"UTC"});
    const monthStart = new Date(Date.UTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth(), 1));
    const weekNumber = Math.floor((windowEnd.getUTCDate() + monthStart.getUTCDay() - 1) / 7) + 1;
    const reportTitle = "Steem Games Activity Report | " + monthName + " " + windowEnd.getUTCFullYear() + " - Week " + weekNumber;
    const totalPosts = rows.reduce((sum, row) => sum + (row.failed ? 0 : row.posts), 0);
    const totalAuthors = rows.reduce((sum, row) => sum + (row.failed ? 0 : row.authors), 0);
    const activeGames = rows.filter(row => !row.failed && row.posts > 0);
    const zeroGames = rows.filter(row => !row.failed && row.posts === 0);
    const topGames = activeGames.slice().sort((a, b) => b.posts - a.posts);
    const topThree = topGames.slice(0, 3);
    const topShare = totalPosts ? Math.round(topThree.reduce((sum, row) => sum + row.posts, 0) / totalPosts * 100) : 0;
    const leader = topGames[0];
    const choose = options => options[Math.floor(Math.random() * options.length)];
    const windowLabel = utcStamp(windowStart) + " to " + utcStamp(windowEnd);
    const generatedAt = utcStamp(new Date());
    const successfulTags = Object.values(tagStats).filter(item => item.status === "ok").length;
    const failedTags = Object.values(tagStats).filter(item => item.status === "error").length;
    const partialTags = Object.values(tagStats).filter(item => item.status === "ok" && item.page_limit_reached).length;
    const analysisOne = activeGames.length
      ? choose([
          "Across the " + games.length + " games monitored, " + activeGames.length + " recorded at least one matching post. " + (leader ? leader.gameName + " ranked first with " + leader.posts + " posts from " + leader.authors + " distinct author accounts." : "No leading game could be identified.") + (topThree.length > 1 ? " The top three entries contributed " + topShare + "% of all game-table post counts." : ""),
          "The scan found activity for " + activeGames.length + " out of " + games.length + " tracked games. " + (leader ? "The highest post count belonged to " + leader.gameName + " (" + leader.posts + " posts; " + leader.authors + " authors)." : "No game ranked above the others.") + (topThree.length > 1 ? " The three leading entries represented " + topShare + "% of the summed game-table counts." : ""),
          "Dedicated-tag activity appeared for " + activeGames.length + " tracked games during this window. " + (leader ? leader.gameName + " was the most frequently posted-about game, with " + leader.posts + " posts and " + leader.authors + " authors." : "No clear activity leader emerged.") + (topThree.length > 1 ? " Combined, the three most active entries made up " + topShare + "% of the table's post counts." : "")
        ])
      : choose([
          "The scan did not find matching posts for any tracked game under its configured dedicated tags.",
          "No tracked game returned a matching post in the configured-tag scan for this reporting window.",
          "No dedicated-tag activity was detected for the games in this directory during the selected period."
        ]);
    const analysisTwo = zeroGames.length
      ? choose([
          zeroGames.length + " game" + (zeroGames.length === 1 ? " had" : "s had") + " no matching posts in this scan: " + zeroGames.map(row => row.gameName).join(", ") + ". ",
          "No matching posts were found for " + zeroGames.length + " tracked game" + (zeroGames.length === 1 ? "" : "s") + ": " + zeroGames.map(row => row.gameName).join(", ") + ". ",
          "The zero-post entries for this period are " + zeroGames.map(row => row.gameName).join(", ") + " (" + zeroGames.length + " total). "
        ])
      : choose([
          "Every successfully queried game had at least one matching post. ",
          "No zero-post games were recorded among the successfully queried entries. ",
          "All games with successful tag queries showed some matching post activity. "
        ]);
    const coverageNote = failedTags
      ? choose([
          failedTags + " tag quer" + (failedTags === 1 ? "y failed" : "ies failed") + "; figures for affected games may be incomplete or unavailable. ",
          "Coverage is limited because " + failedTags + " configured tag quer" + (failedTags === 1 ? "y did not succeed" : "ies did not succeed") + ". ",
          "Use caution when comparing games: " + failedTags + " tag quer" + (failedTags === 1 ? "y returned an error" : "ies returned errors") + ". "
        ])
      : choose([
          "All " + successfulTags + " configured tag queries completed successfully. ",
          "The scan completed all " + successfulTags + " configured tag queries without query errors. ",
          "No configured tag queries failed in this run (" + successfulTags + " successful). "
        ]);
    const limitNote = partialTags ? "The scan reached its per-tag page limit for " + partialTags + " tag" + (partialTags === 1 ? "" : "s") + ", so newer-post coverage may be incomplete. " : "";
    const analysisCaveat = choose([
      "These are public-post and distinct-author-account metrics, not verified gameplay or a census of actual players. Posting about a game does not prove that the author played it, and one person can operate multiple accounts.",
      "Counts reflect matching public posts and distinct posting accounts only. They do not confirm game sessions or real player numbers; authors may post without playing, and individuals may use more than one account.",
      "This report measures tag-matched content, not confirmed gameplay. Author totals count accounts rather than verified people, so they should not be interpreted as actual player counts."
    ]);
    const intro = choose([
      "This report summarizes public Steem posts associated with " + games.length + " games listed in the SGA directory. During the selected seven-day window, " + activeGames.length + " games showed matching post activity. " + "Use the table to compare tag-matched post volume, distinct author accounts, configured discovery tags, and developer profiles where known. Crypto or token rewards depend on each game's rules and are never guaranteed.",
      "SGA scans configured game-related tags to provide a time-bounded view of Steem gaming content. This run covered " + games.length + " listed games and detected posts for " + activeGames.length + ". The table ranks entries by matching post count; Authors means distinct posting accounts, Dedicated Tags shows the tags queried, and Developer links to a Steem profile when a developer username is available. Any game rewards vary by project and are not assured.",
      "The following snapshot compares tag-matched Steem content across " + games.length + " tracked games for the current reporting window. " + activeGames.length + " games had at least one matching post. Post totals are useful for comparing visible publishing activity, while author totals count accounts rather than verified players. Developer profiles are linked only when the directory contains a valid username; game-specific rewards are subject to change and are not guaranteed."
    ]);
    const styles = '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#17263b;line-height:1.65;font-size:15px}' +
      'h1{font-size:25px;line-height:1.25;color:#102b4e;margin:0 0 16px}' +
      'h2{font-size:19px;color:#173d63;margin:25px 0 10px}' +
      '.sga-intro{padding:15px 17px;background:#f1f7ff;border:1px solid #d7e7fa;border-radius:14px}' +
      '.sga-table-wrap{margin:16px 0;overflow-x:auto;border:1px solid #d5e1ef;border-radius:14px}' +
      'table.sga-table{border-collapse:separate;border-spacing:0;width:100%;min-width:650px;font-size:14px;background:#fff}' +
      '.sga-table th{background:#173d63;color:#fff;padding:12px 10px;text-align:left;font-weight:700}' +
      '.sga-table th:first-child{border-top-left-radius:12px}.sga-table th:last-child{border-top-right-radius:12px}' +
      '.sga-table td{padding:11px 10px;border-bottom:1px solid #e4ebf3;vertical-align:top}' +
      '.sga-table tbody tr:nth-child(even){background:#f5f9fe}.sga-table tbody tr:last-child td{border-bottom:0}' +
      '.sga-no{width:42px;text-align:center;color:#667b92;font-weight:700}.sga-game{font-weight:700;min-width:120px}.sga-number{font-variant-numeric:tabular-nums;font-weight:700;color:#176b54;text-align:center}' +
      '.sga-tag{display:inline-block;margin:2px;padding:3px 7px;border-radius:7px;background:#e8f2ff;color:#20568c;font-size:12px;white-space:nowrap}' +
      '.sga-analysis{padding:14px 16px;border-left:4px solid #3c9b7a;background:#f4fbf8;border-radius:4px 12px 12px 4px;margin:12px 0}' +
      'a{color:#145fa8;text-decoration:none}a:hover{text-decoration:underline}' +
      '</style>';
    return styles +
      '<h1>' + escapeHtml(reportTitle) + '</h1>' +
      '<div class="sga-intro"><p>' + escapeHtml(intro) + '</p><p><strong>Reporting window (UTC):</strong> ' + escapeHtml(windowLabel) + '<br><strong>Generated:</strong> ' + escapeHtml(generatedAt) + '<br><strong>Query coverage:</strong> ' + escapeHtml(successfulTags + '/' + (successfulTags + failedTags) + ' tags successful') + '</p></div>' +
      '<div class="sga-table-wrap"><table class="sga-table"><thead><tr><th>No.</th><th>Game</th><th>Posts</th><th>Authors</th><th>Dedicated Tags</th><th>Developer</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
      '<h2>Activity Analysis</h2>' +
      '<div class="sga-analysis"><p>' + escapeHtml(analysisOne) + '</p><p>' + escapeHtml(analysisTwo + coverageNote + limitNote + analysisCaveat) + '</p></div>';
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