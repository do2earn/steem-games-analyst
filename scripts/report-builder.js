(() => {
  "use strict";
  let API_URL = "https://api.steemit.com";
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
  const yearSelect = $("reportYear");
  const monthSelect = $("reportMonth");
  const weekSelect = $("reportWeek");
  const periodRangeLabel = $("selectedPeriodRange");
  const titleBox = $("reportTitleBox");
  const tagsBox = $("reportTagsBox");
  let latestGeneratedHtml = "";


  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function getSelectedPeriod() {
    const year = Number(yearSelect.value);
    const monthIndex = Number(monthSelect.value);
    const week = Number(weekSelect.value);
    const startDay = (week - 1) * 7 + 1;
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const endDay = Math.min(week === 4 ? lastDay : week * 7, lastDay);
    const start = new Date(Date.UTC(year, monthIndex, startDay, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIndex, endDay, 23, 59, 59, 999));
    return {year, monthIndex, week, start, end, startDay, endDay, monthName: MONTH_NAMES[monthIndex]};
  }

  function selectedReportTitle(period) {
    return "Steem Games Activity Report | " + period.monthName + " " + period.year + " - Week " + period.week;
  }

  function updatePeriodFields() {
    const period = getSelectedPeriod();
    const date = day => String(day).padStart(2, "0");
    periodRangeLabel.textContent = "Selected range (UTC): " + period.year + "-" +
      String(period.monthIndex + 1).padStart(2, "0") + "-" + date(period.startDay) +
      " to " + period.year + "-" + String(period.monthIndex + 1).padStart(2, "0") + "-" + date(period.endDay);
    titleBox.value = selectedReportTitle(period);
  }

  function initializePeriodSelectors() {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    for (let year = 2020; year <= currentYear + 1; year++) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      yearSelect.appendChild(option);
    }
    MONTH_NAMES.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      monthSelect.appendChild(option);
    });
    yearSelect.value = String(currentYear);
    monthSelect.value = String(now.getUTCMonth());
    weekSelect.value = String(Math.min(4, Math.floor((now.getUTCDate() - 1) / 7) + 1));
    yearSelect.addEventListener("change", updatePeriodFields);
    monthSelect.addEventListener("change", updatePeriodFields);
    weekSelect.addEventListener("change", updatePeriodFields);
    updatePeriodFields();
  }

  initializePeriodSelectors();

  function setProgress(percent, label, className = "") {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
    progressWrap.hidden = false;
    progressBar.value = safePercent;
    progressPercent.textContent = safePercent + "%";
    progressLabel.textContent = label;
    reportStatus.className = "status " + className;
    reportStatus.textContent = label;
  }

  async function selectFastestApi() {
    const response = await fetch("data/steem-apis.json", {cache: "no-store"});
    if (!response.ok) throw new Error("Could not load data/steem-apis.json (HTTP " + response.status + ").");
    const config = await response.json();
    const endpoints = Array.isArray(config.endpoints)
      ? Array.from(new Set(config.endpoints.map(value => String(value).trim().replace(/\/$/, "")).filter(value => value.startsWith("https://"))))
      : [];
    if (!endpoints.length) throw new Error("No valid Steem API endpoints are configured in data/steem-apis.json.");
    const method = String(config.probe_method || "condenser_api.get_dynamic_global_properties");
    const timeoutMs = Math.max(1000, Math.min(15000, Number(config.timeout_ms) || 7000));
    const results = await Promise.all(endpoints.map(async endpoint => {
      const controller = new AbortController();
      const started = performance.now();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({jsonrpc: "2.0", method, params: [], id: 1}),
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const payload = await response.json();
        const headBlockNumber = Number(payload && payload.result && payload.result.head_block_number);
        if (payload.error || !Number.isFinite(headBlockNumber)) {
          throw new Error(payload.error && payload.error.message ? payload.error.message : "Invalid RPC response");
        }
        return {endpoint, latency: Math.round(performance.now() - started), ok: true, headBlockNumber};
      } catch (error) {
        return {endpoint, latency: Math.round(performance.now() - started), ok: false,
          error: error && error.name === "AbortError" ? "Timeout" : (error && error.message ? error.message : "Request failed")};
      } finally {
        clearTimeout(timer);
      }
    }));
    const available = results.filter(item => item.ok).sort((a, b) => a.latency - b.latency);
    if (!available.length) {
      throw new Error("All " + endpoints.length + " configured Steem API endpoints failed the connectivity test. Check the connection and try again.");
    }
    API_URL = available[0].endpoint;
    return {selected: available[0], tested: results.length, available: available.length};
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

  function buildReportHtml(games, tagStats, allPosts, windowStart, windowEnd, errors, tagsScanned, selectedWeek) {
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
      const tagUrl = tag => "https://www.steemx.org/created/" + encodeURIComponent(tag);
      const tagText = ownTags.map(tag =>
        '<a class="sga-tag" href="' + escapeHtml(tagUrl(tag)) + '" target="_blank" rel="noopener noreferrer">#' + escapeHtml(tag) + '</a>'
      ).join(" ") || "—";
      const linkedCountText = ownTags.length
        ? '<a href="' + escapeHtml(tagUrl(ownTags[0])) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(countText) + '</a>'
        : escapeHtml(countText);
      const developer = String(game.developer || "").trim().replace(/^@/, "");
      const developerText = /^[a-z0-9.-]{3,16}$/.test(developer)
        ? '<a href="https://www.steemx.org/@' + encodeURIComponent(developer) + '" target="_blank" rel="noopener noreferrer">@' + escapeHtml(developer) + '</a>'
        : "—";
      return { gameName: String(game.game_name || game.game_id || "Unknown game"), posts: posts.length, authors: authors.size,
        failed: queryStatus === "Failed", countText, authorText,
        html: '<tr><td class="sga-no"></td><td class="sga-game">' + linkedName + '</td><td class="sga-number">' + linkedCountText + '</td><td class="sga-number">' + authorText + '</td><td>' + tagText + '</td><td>' + developerText + '</td></tr>' };
    }).sort((a, b) => { if (a.failed !== b.failed) return a.failed ? 1 : -1; return b.posts - a.posts || a.gameName.localeCompare(b.gameName); });
    rows.forEach((row, index) => { row.html = row.html.replace('<td class="sga-no"></td>', '<td class="sga-no">' + (index + 1) + '</td>'); });
    const tableRows = rows.map(row => row.html).join("\n");
    const monthName = windowStart.toLocaleString("en-US", {month:"long", timeZone:"UTC"});
    const totalPosts = rows.reduce((sum, row) => sum + (row.failed ? 0 : row.posts), 0);
    const totalAuthors = rows.reduce((sum, row) => sum + (row.failed ? 0 : row.authors), 0);
    const activeGames = rows.filter(row => !row.failed && row.posts > 0);
    const zeroGames = rows.filter(row => !row.failed && row.posts === 0);
    const topGames = activeGames.slice().sort((a, b) => b.posts - a.posts);
    const topThree = topGames.slice(0, 3);
    const topShare = totalPosts ? Math.round(topThree.reduce((sum, row) => sum + row.posts, 0) / totalPosts * 100) : 0;
    const leader = topGames[0];
    function normalizeReportText(value) {
      return String(value ?? "")
        .replace(/\bSGA scans?\b/gi, "This report covers")
        .replace(/\bthe selected seven-day window\b/gi, "the seven days covered")
        .replace(/\bconfigured dedicated tags\b/gi, "game tags")
        .replace(/\bconfigured-tag scan\b/gi, "tag search")
        .replace(/\btag-matched\b/gi, "tagged")
        .replace(/\bdistinct author accounts\b/gi, "authors")
        .replace(/\bmatching post activity\b/gi, "posts")
        .replace(/\bentries\b/gi, "games")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim();
    }
    const windowLabel = utcStamp(windowStart) + " to " + utcStamp(windowEnd);
    const generatedAt = utcStamp(new Date());
    const successfulTags = Object.values(tagStats).filter(item => item.status === "ok").length;
    const failedTags = Object.values(tagStats).filter(item => item.status === "error").length;
    const partialTags = Object.values(tagStats).filter(item => item.status === "ok" && item.page_limit_reached).length;
    const analysisOne = activeGames.length
      ? activeGames.length + " of " + games.length + " tracked games had posts during this period. " +
        (leader ? leader.gameName + " was the most active, with " + leader.posts + " posts from " + leader.authors + " authors." : "No game stood out as the activity leader.") +
        (topThree.length > 1 ? " The three busiest games accounted for " + topShare + "% of the post counts in the table." : "")
      : "No posts were found for the tracked games during this period.";
    const analysisTwo = zeroGames.length
      ? "No posts were found for " + zeroGames.length + " game" + (zeroGames.length === 1 ? "" : "s") + ": " + zeroGames.map(row => row.gameName).join(", ") + ". "
      : "Each game with a successful tag search had at least one post. ";
    const coverageNote = failedTags
      ? failedTags + " tag search" + (failedTags === 1 ? " failed" : "es failed") + ", so some figures may be incomplete. "
      : "All " + successfulTags + " tag searches completed without errors. ";
    const limitNote = partialTags ? "The page limit was reached for " + partialTags + " tag" + (partialTags === 1 ? "" : "s") + "; older posts may have been missed. " : "";
    const analysisCaveat = "These figures count public posts and author accounts, not confirmed players. Posting about a game does not prove that someone played it, and one person may use more than one account.";
    const intro = "This report covers " + games.length + " Steem games from " + utcStamp(windowStart).slice(0, 10) + " through " + utcStamp(windowEnd).slice(0, 10) + ". " +
      activeGames.length + (activeGames.length === 1 ? " game had" : " games had") + " at least one post under its listed tags. " +
      "The table compares post counts, authors, tags used to find each game's content, and developer profiles where available. " +
      "Rewards, where offered, depend on each game's rules and are not guaranteed.";
    const introductionParagraphs = [
      "Hello, Steem Games Enthusiasts and Developers!",
      "Games built on the Steem blockchain are entertaining projects that have successfully attracted a significant portion of the user base across Steem platforms. Some players compete on these games' leaderboards, earning small amounts of $STEEM. Others go a step further: by playing these games and creating content about their gameplay on Steem platforms, they aim to earn greater rewards through upvotes from the dedicated curation team for Steem games.",
      "Unfortunately, despite these efforts, these play-to-earn blockchain games remain largely unknown to the broader online community, and their player counts remain relatively low compared to games on other blockchain networks.",
      "Regrettably, unlike in previous months, no specialized curation team for Steem games has been appointed by the Steemit core team for October 2026. My own inquiries, made in my capacity as a developer of one of these games, have yielded no positive results.",
      "Furthermore, the absence of a unified, dedicated platform for Steem games has left many Steem users completely unaware of their existence. Consequently, I have decided to create and publish a weekly statistical and analytical report focused on Steem games."
    ];
    const styles = '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#17263b;line-height:1.65;font-size:15px}' +
      'h1{font-size:25px;line-height:1.25;color:#102b4e;margin:0 0 16px}' +
      'h2{font-size:19px;color:#173d63;margin:25px 0 10px}' +
      '.sga-intro{padding:15px 17px;background:#f1f7ff;border:1px solid #d7e7fa;border-radius:14px}' +
      '.sga-intro-card,.sga-stat-card,.sga-activity-card{margin:14px 0;padding:15px 17px;border:1px solid #d7e7fa;border-radius:14px;background:#f1f7ff;color:#17263b}' +
      '.sga-intro-card p{margin:0 0 12px}.sga-intro-card p:last-child{margin-bottom:0}.sga-stat-card h1{font-size:25px;line-height:1.25;color:#102b4e;margin:0 0 14px}.sga-stat-card .sga-intro{margin:0 0 14px}.sga-activity-card h2{margin:0 0 10px}' +
      '.sga-table-wrap{margin:16px 0;overflow-x:auto;border:1px solid #d5e1ef;border-radius:14px}' +
      'table.sga-table{border-collapse:separate;border-spacing:0;width:100%;min-width:650px;font-size:14px;background:#fff}' +
      '.sga-table th{background:#173d63;color:#fff;padding:12px 10px;text-align:left;font-weight:700}' +
      '.sga-table th:first-child{border-top-left-radius:12px}.sga-table th:last-child{border-top-right-radius:12px}' +
      '.sga-table td{padding:11px 10px;border-bottom:1px solid #e4ebf3;vertical-align:top}' +
      '.sga-table tbody tr:nth-child(even){background:#f5f9fe}.sga-table tbody tr:last-child td{border-bottom:0}' +
      '.sga-no{width:42px;text-align:center;color:#667b92;font-weight:700}.sga-game{font-weight:700;min-width:120px}.sga-number{font-variant-numeric:tabular-nums;font-weight:700;color:#176b54;text-align:center}' +
      '.sga-tag{display:inline-block;margin:2px;padding:3px 7px;border-radius:7px;background:#e8f2ff;color:#20568c;font-size:12px;white-space:nowrap}' +
      '.sga-analysis{padding:14px 16px;border-left:4px solid #3c9b7a;background:#f4fbf8;border-radius:4px 12px 12px 4px;margin:12px 0}' +
      '.sga-ad-card{margin:18px 0;padding:clamp(12px,2.5vw,22px);border:1px solid #168bff;border-radius:15px;background:linear-gradient(145deg,#071a36 0%,#102e59 58%,#07162c 100%);color:#f4f8ff;box-shadow:0 5px 16px rgba(10,42,84,.16);overflow:hidden;overflow-wrap:anywhere}' +
      '.sga-ad-card h2,.sga-ad-card h3{color:#fff;text-align:center;margin:12px 0 7px}.sga-ad-card p,.sga-ad-card li{color:#edf5ff}.sga-ad-card a{color:#8bd4ff;font-weight:700}.sga-ad-card blockquote{margin:6px 0 10px;padding:7px 10px;border-left:3px solid #70bfff;background:rgba(255,255,255,.06);font-size:13px}' +
      '.sga-ad-image{text-align:center;margin:0 auto 10px}.sga-ad-image img{display:block;width:100%;max-width:680px;height:auto;max-height:220px;object-fit:cover;margin:0 auto;border-radius:9px;border:1px solid #4b9cff}' +
      '.sga-ad-heading{text-align:center;font-size:clamp(21px,3.5vw,27px);font-weight:800;margin:5px 0}.sga-ad-tagline{text-align:center;font-size:clamp(15px,2.3vw,18px);font-weight:700;margin:5px 0 8px}' +
      '.sga-ad-trust{text-align:center;font-size:12px;color:#c7dcf5!important;margin:6px 0 10px}.sga-ad-card hr{border:0;border-top:1px solid #5d8dbd;margin:12px 0}.sga-ad-rate{border:2px solid #000;background:#39ff14;color:#071a09;padding:10px 8px;font-size:clamp(19px,2.8vw,23px);font-weight:800;text-align:center;border-radius:9px;margin:8px 0}' +
      '.sga-ad-cta{display:block;text-align:center;background:#168bff;color:#fff!important;padding:10px 12px;border-radius:9px;font-size:clamp(16px,2.3vw,19px);margin:9px auto;max-width:460px;box-shadow:0 3px 9px rgba(0,0,0,.18)}.sga-ad-secondary{text-align:center;font-size:14px;margin:8px 0}.sga-ad-steps{padding-left:21px;margin:8px 0}.sga-ad-steps li{margin:6px 0}' +
      '@media(max-width:600px){.sga-ad-card{margin:12px 0;padding:10px;border-radius:11px;box-shadow:none}.sga-ad-image{margin-bottom:7px}.sga-ad-image img{max-height:125px;border-radius:7px}.sga-ad-heading{font-size:22px;margin:3px 0}.sga-ad-tagline{font-size:15px;margin:3px 0 6px}.sga-ad-trust{font-size:11px;line-height:1.4;margin:5px 0 8px}.sga-ad-cta{padding:9px 10px;margin:7px auto;font-size:16px;border-radius:8px}.sga-ad-card p,.sga-ad-card li{font-size:13px;line-height:1.5}.sga-ad-card h2,.sga-ad-card h3{font-size:17px;margin:9px 0 5px}.sga-ad-card hr{margin:9px 0}.sga-ad-rate{font-size:20px;padding:9px 6px;margin:7px 0}.sga-ad-steps{padding-left:19px;margin:6px 0}.sga-ad-steps li{margin:5px 0}.sga-ad-secondary{font-size:13px;margin:6px 0}}' +
      'a{color:#145fa8;text-decoration:none}a:hover{text-decoration:underline}' +
      '</style>';
    return styles +
      '<div class="sga-intro-card">' + introductionParagraphs.map(paragraph => '<p>' + escapeHtml(paragraph) + '</p>').join("") + '</div>' +
      '<div class="sga-stat-card"><h1>Steem Games Statistical Table</h1>' +
      '<div class="sga-intro"><p>' + escapeHtml(normalizeReportText(intro)) + '</p></div>' +
      '<div class="sga-table-wrap"><table class="sga-table"><thead><tr><th>No.</th><th>Game</th><th>Posts</th><th>Authors</th><th>Dedicated Tags</th><th>Developer</th></tr></thead><tbody>' + tableRows + '</tbody></table></div></div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;border:2px solid #168bff;border-radius:12px;background-color:#071a36;border-collapse:separate;border-spacing:0;margin:14px 0;color:#f4f8ff;"><tr><td style="padding:12px;background-color:#071a36;color:#f4f8ff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;overflow-wrap:anywhere;">' +
        '<p style="text-align:center;margin:0 0 8px;"><a href="https://steemflags.do2earn.dev" target="_blank" rel="noopener noreferrer"><img src="https://cdn.steemitimages.com/DQmZyJR1a1HcrkLBgCRXnuPJuyRfAxHBRyaSm7ZYR7XomWa/steemflags_intro.png" alt="Steem Flags flag quiz game preview" width="680" style="display:block;width:100%;max-width:680px;height:auto;margin:0 auto;border:1px solid #4b9cff;border-radius:7px;"></a></p>' +
        '<h2 style="color:#ffffff;text-align:center;font-size:23px;line-height:1.25;margin:6px 0;">🏳️ Steem Flags</h2>' +
        '<p style="color:#ffffff;text-align:center;font-size:16px;font-weight:bold;margin:4px 0 7px;">Guess the Flags. Play. Earn D2E.</p>' +
        '<p style="color:#c7dcf5;text-align:center;font-size:12px;margin:5px 0 10px;">Free to play · Built on the Steem blockchain · By <a href="https://do2earn.dev" target="_blank" rel="noopener noreferrer" style="color:#8bd4ff;font-weight:bold;">Do2Earn</a></p>' +
        '<p style="text-align:center;margin:8px 0 12px;"><a href="https://steemflags.do2earn.dev" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#168bff;color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:9px 14px;border-radius:8px;">▶ PLAY FREE NOW</a></p>' +
        '<p style="color:#edf5ff;margin:8px 0;"><strong>Test your knowledge of the world\'s flags, challenge yourself, and share your gameplay experience with the Steem community.</strong></p>' +
        '<hr style="border:0;border-top:1px solid #5d8dbd;margin:10px 0;">' +
        '<h3 style="color:#ffffff;text-align:center;font-size:17px;margin:8px 0;">💰 D2E to STEEM</h3>' +
        '<p style="border:2px solid #000000;background-color:#39ff14;color:#071a09;padding:9px 6px;font-size:21px;font-weight:bold;text-align:center;border-radius:8px;margin:8px 0;">1,000 D2E = 1 STEEM</p>' +
        '<p style="color:#edf5ff;margin:7px 0;">D2E is an off-chain in-game token earned through activities such as playing the flag quiz.</p>' +
        '<ol style="color:#edf5ff;padding-left:21px;margin:7px 0;">' +
          '<li style="color:#edf5ff;margin:5px 0;"><strong>Play Steem Flags</strong> and earn D2E.</li>' +
          '<li style="color:#edf5ff;margin:5px 0;"><strong>Get more ⚡Energy</strong> to play more. Free energy recharges daily; extra energy can be purchased in-game.</li>' +
          '<li style="color:#edf5ff;margin:5px 0;"><strong>Reach 10,000 D2E</strong> to meet the minimum swap amount.</li>' +
          '<li style="color:#edf5ff;margin:5px 0;"><strong>Swap 10,000 D2E for 10 STEEM</strong> in your internal wallet.</li>' +
          '<li style="color:#edf5ff;margin:5px 0;"><strong>Withdraw your STEEM</strong> to an external wallet, subject to the game\'s withdrawal rules and weekly limit.</li>' +
        '</ol>' +
        '<p style="color:#c7dcf5;text-align:center;font-size:12px;margin:8px 0;">Rewards and withdrawals are subject to the game\'s rules; earnings are not guaranteed.</p>' +
        '<hr style="border:0;border-top:1px solid #5d8dbd;margin:10px 0;">' +
        '<p style="text-align:center;font-size:14px;margin:7px 0;">📘 <strong><a href="https://steemflags.do2earn.dev/earnmoresteem.html" target="_blank" rel="noopener noreferrer" style="color:#8bd4ff;font-weight:bold;">Learn how to earn more STEEM</a></strong></p>' +
        '</td></tr></table>' +
      '<div class="sga-activity-card"><h2>Activity Analysis</h2>' +
      '<div class="sga-analysis"><p>' + escapeHtml(normalizeReportText(analysisOne)) + '</p><p>' + escapeHtml(normalizeReportText(analysisTwo + coverageNote + limitNote + analysisCaveat)) + '</p></div></div>';
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
    setProgress(2, "Testing configured Steem API servers…");
    try {
      const apiSelection = await selectFastestApi();
      $("selectedApiStatus").textContent = "Steem API selected: " + apiSelection.selected.endpoint + " · " + apiSelection.selected.latency + " ms · " + apiSelection.available + "/" + apiSelection.tested + " servers responsive.";
      $("selectedApiStatus").className = "small ok";
      setProgress(3, "Selected fastest responsive API: " + apiSelection.selected.endpoint + " (" + apiSelection.selected.latency + " ms; " + apiSelection.available + "/" + apiSelection.tested + " available). Loading game tags…", "ok");
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
      const period = getSelectedPeriod();
      const since = period.start;
      const until = period.end;
      titleBox.value = selectedReportTitle(period);
      const tagStats = {};
      const allPosts = new Map();
      const errors = [];
      setProgress(4, "Ready to scan " + allTags.length + " tags for " + period.monthName + " " + period.year + ", Week " + period.week + ".");
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
      const dedicatedTags = Array.from(new Set(games.flatMap(game => (Array.isArray(game.tags) ? game.tags : []).map(tag => String(tag).trim().toLowerCase()).filter(Boolean))));
      tagsBox.value = dedicatedTags.sort((a, b) => {
        const aStats = tagStats[a];
        const bStats = tagStats[b];
        const aCount = aStats && aStats.status === "ok" ? aStats.post_count : -1;
        const bCount = bStats && bStats.status === "ok" ? bStats.post_count : -1;
        return bCount - aCount || a.localeCompare(b);
      }).map(tag => "#" + tag).join(", ");
      const successes = Object.values(tagStats).filter(item => item.status === "ok").length;
      if (!successes) throw new Error("All tag queries failed. No report was generated; check the API connection and try again.");
      setProgress(80, "Analyzing unique posts, authors, and last activity…");
      await new Promise(resolve => setTimeout(resolve, 30));
      setProgress(88, "Building the game activity table and tag diagnostics…");
      await new Promise(resolve => setTimeout(resolve, 30));
      const reportHtml = buildReportHtml(games, tagStats, allPosts, since, until, errors, {general: Array.from(generalTags)}, period.week);
      setProgress(96, "Preparing the HTML editor…");
      editor.value = reportHtml;
      latestGeneratedHtml = reportHtml;
      $("reportEditorSection").hidden = false;
      copyBtn.disabled = false;
      previewBtn.disabled = false;
      setProgress(100, "Report ready for " + period.monthName + " " + period.year + ", Week " + period.week + ". Review or edit the HTML, then select Preview.", errors.length ? "warn" : "ok");
      $("reportResultSummary").textContent = period.monthName + " " + period.year + ", Week " + period.week + " (" + utcStamp(since).slice(0, 10) + " to " + utcStamp(until).slice(0, 10) + ") · " + allPosts.size + " unique posts · " + successes + "/" + allTags.length + " tag queries successful · " + errors.length + " errors";
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
  async function copyTextBox(box, label) {
    const value = box.value;
    if (!value.trim()) {
      setProgress(progressBar.value, "There is no " + label + " to copy yet.", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setProgress(progressBar.value, label + " copied to clipboard.", "ok");
    } catch (_) {
      box.focus();
      box.select();
      const copied = document.execCommand("copy");
      setProgress(progressBar.value, copied ? label + " copied to clipboard." : "Select and copy the " + label.toLowerCase() + " manually.", copied ? "ok" : "warn");
    }
  }

  $("copyTitleBtn").addEventListener("click", () => copyTextBox(titleBox, "Report title"));
  $("copyEditorBtn").addEventListener("click", () => copyTextBox(editor, "Report HTML"));
  $("copyTagsBtn").addEventListener("click", () => copyTextBox(tagsBox, "Game tags"));

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