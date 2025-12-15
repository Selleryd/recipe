/***********************
 * Recipe Doctor — app.js (SINGLE COPY/PASTE FILE)
 * Works with YOUR index.html IDs exactly.
 *
 * Fixes / upgrades:
 * - No RAW JSON on UI (you don’t have one, but we never render it)
 * - Decodes funky characters (Chef John&#39;s → Chef John's)
 * - Strips any accidental HTML tags coming from the model (<span>…</span>)
 * - Never highlights inside URLs (no broken MonkVee links)
 * - Detected issues: RED underlined problem + GREEN underlined fix
 * - Ingredients: bad terms RED underline, MonkVee swap suggestions GREEN + clickable links
 * - “Swaps applied (fast)” shown at the TOP of rewritten recipe card
 * - Modern SaaS polish (keeps your background vibe; improves cards/buttons/typography)
 ***********************/

// ✅ PUT YOUR /exec URL HERE (NOT /dev)
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwHit5eCifvBli8xuQyuQ25xUYF61p5HeuMFbQwAuH3A4ZKFvgiGRfYE4IQ5G3oVF81/exec";

/* -----------------------
   MonkVee product catalog (links only to MonkVee)
------------------------ */
const MONKVEE = {
  original_11: {
    label: "MonkVee Original Monk Fruit Sweetener (1:1 sugar equivalent)",
    url: "https://monkvee.com/products/monk-fruit-sweetener-original"
  },
  golden_11: {
    label: "MonkVee Golden Monk Fruit Sweetener (1:1 sugar equivalent)",
    url: "https://monkvee.com/products/monk-fruit-sugar-golden"
  },
  monk_extract_150x: {
    label: "MonkVee Pure Monk Fruit Extract (150x sweeter than sugar)",
    url: "https://monkvee.com/products/monk-fruit-extract"
  },
  stevia_extract_300x: {
    label: "MonkVee Pure Stevia Extract (300x sweeter than sugar)",
    url: "https://monkvee.com/products/stevia-extract"
  }
};

/* -----------------------
   UI polish (SaaS-ish)
------------------------ */
(function injectPolish() {
  const css = `
    :root{
      --rr-red:#ff4d4d;
      --rr-green:#22c55e;
      --rr-cyan:#7dd3fc;
      --rr-card-border:rgba(255,255,255,.12);
      --rr-card-bg:rgba(255,255,255,.045);
      --rr-shadow: 0 18px 55px rgba(0,0,0,.35);
      --rr-soft: rgba(255,255,255,.08);
      --rr-text: rgba(255,255,255,.92);
      --rr-muted: rgba(255,255,255,.68);
    }
    body{color:var(--rr-text)}
    .card{
      background:var(--rr-card-bg) !important;
      border:1px solid var(--rr-card-border) !important;
      box-shadow:var(--rr-shadow);
      backdrop-filter: blur(10px);
    }
    .input{
      background: rgba(0,0,0,.18) !important;
      border:1px solid rgba(255,255,255,.14) !important;
    }
    .input:focus{
      outline:none !important;
      border-color: rgba(125, 211, 252, .65) !important;
      box-shadow: 0 0 0 4px rgba(125, 211, 252, .12) !important;
    }
    .btn{
      border:1px solid rgba(255,255,255,.16) !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.25);
      transition: transform .08s ease, box-shadow .2s ease, opacity .2s ease;
    }
    .btn:hover{transform: translateY(-1px)}
    .btn:active{transform: translateY(0px); opacity:.95}
    .muted{color:var(--rr-muted) !important}
    .hint{color:var(--rr-muted) !important}
    .logo{box-shadow: 0 0 0 1px rgba(255,255,255,.10), 0 12px 28px rgba(0,0,0,.35)}
    .recipeTitle{letter-spacing:.2px}
    .subhead{opacity:.92}
    .stack > *{margin-bottom:10px}
    .rr-pill{
      display:inline-flex; align-items:center; gap:8px;
      padding:6px 10px; border-radius:999px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.12);
      font-size:12px; line-height:1;
    }
    .rr-pill.high{color:var(--rr-red)}
    .rr-pill.medium{color:#fbbf24}
    .rr-pill.low{color:var(--rr-cyan)}
    .rr-bad{color:var(--rr-red); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px}
    .rr-good{color:var(--rr-green); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px}
    .rr-link{color:var(--rr-cyan); text-decoration: underline}
    .rr-box{
      border:1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.04);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .rr-small{font-size:12px}
    .rr-swapfast{
      margin-top:10px;
      border:1px solid rgba(34,197,94,.22);
      background: rgba(34,197,94,.06);
      border-radius:14px;
      padding:12px 14px;
    }
    .rr-swapfast h3{margin:0 0 8px 0; font-size:14px}
    .rr-swapfast ul{margin:8px 0 0 18px}
    .rr-error{
      color:#ffd1d1;
      border:1px solid rgba(255,77,77,.25);
      background: rgba(255,77,77,.08);
      border-radius:14px;
      padding:12px 14px;
    }
    .ingList li, .noteList li{margin: 10px 0}
    .stepList li{margin: 10px 0}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* -----------------------
   DOM (matches your index.html)
------------------------ */
const el = {
  url: document.getElementById("url"),
  strictness: document.getElementById("strictness"),

  avoidSeedOils: document.getElementById("avoidSeedOils"),
  lowerSugar: document.getElementById("lowerSugar"),
  avoidDyes: document.getElementById("avoidDyes"),
  avoidUltraProcessed: document.getElementById("avoidUltraProcessed"),

  go: document.getElementById("go"),
  scanOnly: document.getElementById("scanOnly"),

  issuesList: document.getElementById("issuesList"),
  swapsList: document.getElementById("swapsList"),

  origTitle: document.getElementById("origTitle"),
  origMeta: document.getElementById("origMeta"),
  origIngredients: document.getElementById("origIngredients"),
  origInstructions: document.getElementById("origInstructions"),

  newTitle: document.getElementById("newTitle"),
  newMeta: document.getElementById("newMeta"),
  newIngredients: document.getElementById("newIngredients"),
  newInstructions: document.getElementById("newInstructions"),
  newNotes: document.getElementById("newNotes"),

  changeLog: document.getElementById("changeLog"),

  // Admin
  toggleAdmin: document.getElementById("toggleAdmin"),
  adminDrawer: document.getElementById("adminDrawer"),
  closeAdmin: document.getElementById("closeAdmin"),
  adminToken: document.getElementById("adminToken"),

  badName: document.getElementById("badName"),
  badCategory: document.getElementById("badCategory"),
  badNotes: document.getElementById("badNotes"),
  badMatchType: document.getElementById("badMatchType"),
  addBad: document.getElementById("addBad"),
  badStatus: document.getElementById("badStatus"),

  swapTriggers: document.getElementById("swapTriggers"),
  swapTo: document.getElementById("swapTo"),
  swapConstraint: document.getElementById("swapConstraint"),
  swapRatio: document.getElementById("swapRatio"),
  swapAvoidIf: document.getElementById("swapAvoidIf"),
  swapTasteNote: document.getElementById("swapTasteNote"),
  addSwap: document.getElementById("addSwap"),
  swapStatus: document.getElementById("swapStatus"),

  adminListBad: document.getElementById("adminListBad"),
  adminListSwaps: document.getElementById("adminListSwaps"),
  adminOut: document.getElementById("adminOut")
};

/* -----------------------
   Helpers
------------------------ */
function ensureClientId() {
  const k = "rr_client_id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = "c_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(k, v);
  }
  return v;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeEntities(str) {
  const t = document.createElement("textarea");
  t.innerHTML = String(str ?? "");
  return t.value;
}

function stripHtmlTags(str) {
  // In case model ever returns "<span ...>" etc.
  return String(str ?? "").replace(/<[^>]*>/g, "");
}

function cleanText(str) {
  return stripHtmlTags(decodeEntities(str ?? "")).trim();
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/®|™|℠/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clearNode(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function liHtml(html) {
  const li = document.createElement("li");
  li.innerHTML = html;
  return li;
}

function textNode(tag, text) {
  const elx = document.createElement(tag);
  elx.textContent = text;
  return elx;
}

function setMutedBox(node, text) {
  node.innerHTML = `<div class="muted">${escapeHtml(text)}</div>`;
}

function setErrorBox(node, text) {
  node.innerHTML = `<div class="rr-error">Error: ${escapeHtml(text)}</div>`;
}

function extractUrl(line) {
  const m = String(line ?? "").match(/https?:\/\/\S+/);
  return m ? m[0] : "";
}

function removeUrlFromText(line) {
  const url = extractUrl(line);
  if (!url) return String(line ?? "").trim();
  return String(line ?? "").replace(url, "").replace(/\s+/g, " ").trim();
}

function highlightTermsHtml(text, terms, className) {
  let html = escapeHtml(text);
  for (const raw of terms) {
    const term = String(raw || "").trim();
    if (!term) continue;
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b(${safe})\\b`, "gi");
    html = html.replace(re, `<span class="${className}">$1</span>`);
  }
  return html;
}

// Heuristic: choose MonkVee product for sugar replacement
function pickMonkveeForSugar(lineText) {
  const t = normalizeText(lineText);
  const isBrown = t.includes("brown sugar") || t.includes("dark brown sugar") || t.includes("light brown sugar") || t.includes("molasses");
  const isWhite = t.includes("white sugar") || t.includes("granulated sugar") || t.includes("caster sugar") || t.includes("superfine sugar");

  // If it’s bulk (cups/tbsp or >= 1 tsp): use 1:1
  const bulk = /(\d+\/\d+|\d+(\.\d+)?)(\s*)(cup|cups|tbsp|tablespoon|tablespoons)\b/i.test(lineText)
    || /(\d+\/\d+|\d+(\.\d+)?)(\s*)(tsp|teaspoon|teaspoons)\b/i.test(lineText);

  // If tiny (< 1 tsp): consider extracts
  const tinyTsp = /(\d+\/\d+|\d+(\.\d+)?)(\s*)(tsp|teaspoon|teaspoons)\b/i.test(lineText)
    && (() => {
      const m = lineText.match(/(\d+\/\d+|\d+(\.\d+)?)(?=\s*(tsp|teaspoon|teaspoons)\b)/i);
      if (!m) return false;
      const n = m[1].includes("/") ? (Number(m[1].split("/")[0]) / Number(m[1].split("/")[1])) : Number(m[1]);
      return n > 0 && n < 1;
    })();

  if (bulk && isBrown) return MONKVEE.golden_11;
  if (bulk && (isWhite || t.includes("sugar"))) return MONKVEE.original_11;

  if (tinyTsp) {
    // Default to monk fruit extract for tiny; stevia as alternate
    return MONKVEE.monk_extract_150x;
  }

  // Default
  return isBrown ? MONKVEE.golden_11 : MONKVEE.original_11;
}

function buildPrefs() {
  return {
    avoidSeedOils: !!el.avoidSeedOils?.checked,
    lowerAddedSugar: !!el.lowerSugar?.checked,
    avoidArtificialDyes: !!el.avoidDyes?.checked,
    avoidUltraProcessed: !!el.avoidUltraProcessed?.checked,
    strictness: el.strictness?.value || "balanced"
  };
}

/* -----------------------
   JSONP
------------------------ */
function jsonp(url, cbName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP request timed out."));
    }, 25000);

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Network error loading JSONP."));
    };

    document.head.appendChild(script);
  });
}

function buildJsonpUrl(params) {
  const cbName = "__rr_cb_" + Math.random().toString(16).slice(2);
  const qs = new URLSearchParams(params);
  qs.set("callback", cbName);
  qs.set("_", String(Date.now()));
  const joiner = GAS_WEBAPP_URL.includes("?") ? "&" : "?";
  return { cbName, url: `${GAS_WEBAPP_URL}${joiner}${qs.toString()}` };
}

/* -----------------------
   Rendering
------------------------ */
function setLoading(isLoading) {
  if (el.go) el.go.disabled = isLoading;
  if (el.scanOnly) el.scanOnly.disabled = isLoading;

  if (isLoading) {
    el.issuesList.innerHTML = `<div class="muted">Working…</div>`;
    el.swapsList.innerHTML = `<div class="muted">—</div>`;
  }
}

function renderMeta(metaEl, items) {
  // items: [{label, value, href?}]
  if (!metaEl) return;
  metaEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "10px";
  wrap.style.flexWrap = "wrap";
  items.forEach(x => {
    const pill = document.createElement("div");
    pill.className = "rr-pill";
    if (x.href) {
      pill.innerHTML = `<a class="rr-link" href="${x.href}" target="_blank" rel="noopener">${escapeHtml(x.label)}: ${escapeHtml(x.value)}</a>`;
    } else {
      pill.innerHTML = `${escapeHtml(x.label)}: <span class="muted">${escapeHtml(x.value)}</span>`;
    }
    wrap.appendChild(pill);
  });
  metaEl.appendChild(wrap);
}

function renderSwapFastTop(data) {
  // Inside rewritten meta area, prepend a “Swaps applied (fast)” block
  const changeLog = Array.isArray(data?.result?.changeLog) ? data.result.changeLog : [];
  const swaps = Array.isArray(data?.swapSuggestions) ? data.swapSuggestions : [];

  const lines = [];

  // Prefer explicit changeLog changes
  for (const c of changeLog) {
    const t = cleanText(c?.change || "");
    if (t) lines.push(t);
  }

  // Also include swap rules matched
  for (const s of swaps) {
    const trig = cleanText(s?.trigger || "");
    const to = cleanText(s?.swapTo || "");
    if (trig && to) lines.push(`${trig} → ${to}`);
  }

  // Dedup, cap
  const seen = new Set();
  const clean = [];
  for (const l of lines) {
    const k = normalizeText(l);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    clean.push(l);
    if (clean.length >= 10) break;
  }

  // Remove any previous block
  const prev = document.getElementById("rrSwapFast");
  if (prev) prev.remove();

  if (!clean.length) return;

  const box = document.createElement("div");
  box.id = "rrSwapFast";
  box.className = "rr-swapfast";
  box.innerHTML = `
    <h3>Swaps applied (fast)</h3>
    <div class="muted rr-small">The main changes we made so you see the swaps immediately.</div>
    <ul>${clean.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
  `;

  // Insert right after rewritten header meta
  const rewrittenCardHead = el.newMeta?.parentElement;
  if (rewrittenCardHead) {
    rewrittenCardHead.insertAdjacentElement("afterend", box);
  } else {
    // fallback: add to top of rewritten card
    document.querySelectorAll(".card")[0]?.prepend(box);
  }
}

function renderIssues(data) {
  const aiIssues = Array.isArray(data?.result?.issues) ? data.result.issues : [];
  const dbIssues = Array.isArray(data?.dbIssues) ? data.dbIssues : [];

  if (aiIssues.length) {
    el.issuesList.innerHTML = "";
    aiIssues.slice(0, 30).forEach(i => {
      const sev = (cleanText(i?.severity) || "low").toLowerCase();
      const cat = cleanText(i?.category) || "other";
      const finding = cleanText(i?.finding);
      const why = cleanText(i?.why);
      const evidence = cleanText(i?.evidence);
      const fix = cleanText(i?.recommendedFix);

      const card = document.createElement("div");
      card.className = "rr-box";

      const pill = document.createElement("div");
      pill.className = `rr-pill ${sev}`;
      pill.innerHTML = `<span class="${sev === "high" ? "rr-pill high" : sev === "medium" ? "rr-pill medium" : "rr-pill low"}">${escapeHtml(cat)} / ${escapeHtml(sev)}</span>`;
      // pill above is nested pill; keep it simple:
      pill.innerHTML = `<span class="rr-pill ${sev}">${escapeHtml(cat)} / ${escapeHtml(sev)}</span>`;
      card.appendChild(pill);

      if (finding) {
        const div = document.createElement("div");
        div.style.marginTop = "8px";
        div.innerHTML = `<span class="rr-bad">${escapeHtml(finding)}</span>`;
        card.appendChild(div);
      }

      if (why) {
        const div = document.createElement("div");
        div.className = "muted";
        div.style.marginTop = "8px";
        div.textContent = why;
        card.appendChild(div);
      }

      if (evidence) {
        const div = document.createElement("div");
        div.className = "muted rr-small";
        div.style.marginTop = "6px";
        div.textContent = `Evidence: ${evidence}`;
        card.appendChild(div);
      }

      if (fix) {
        const div = document.createElement("div");
        div.style.marginTop = "10px";
        div.innerHTML = `Fix: <span class="rr-good">${escapeHtml(fix)}</span>`;
        card.appendChild(div);
      }

      el.issuesList.appendChild(card);
    });
    return;
  }

  if (!dbIssues.length) {
    setMutedBox(el.issuesList, "No matches found from your database.");
    return;
  }

  // fallback db issues
  el.issuesList.innerHTML = "";
  dbIssues.slice(0, 40).forEach(x => {
    const name = cleanText(x?.name || "");
    const cat = cleanText(x?.category || "other");
    const notes = cleanText(x?.notes || "");
    const row = document.createElement("div");
    row.className = "rr-box";
    row.innerHTML = `
      <div><span class="rr-bad">${escapeHtml(name)}</span> <span class="muted rr-small">(${escapeHtml(cat)})</span></div>
      ${notes ? `<div class="muted rr-small" style="margin-top:6px">${escapeHtml(notes)}</div>` : ""}
    `;
    el.issuesList.appendChild(row);
  });
}

function renderSwaps(data) {
  const swaps = Array.isArray(data?.swapSuggestions) ? data.swapSuggestions : [];
  if (!swaps.length) {
    setMutedBox(el.swapsList, "No swap rules matched.");
    return;
  }

  el.swapsList.innerHTML = "";
  swaps.slice(0, 40).forEach(s => {
    const trigger = cleanText(s?.trigger || "");
    const swapTo = cleanText(s?.swapTo || "");
    const ratioNote = cleanText(s?.ratioNote || "");
    const constraint = cleanText(s?.constraint || "");
    const tasteNote = cleanText(s?.tasteNote || "");

    const row = document.createElement("div");
    row.className = "rr-box";
    row.innerHTML = `
      <div><span class="rr-bad">${escapeHtml(trigger)}</span></div>
      <div style="margin-top:6px">Suggested: <span class="rr-good">${escapeHtml(swapTo)}</span></div>
      ${constraint ? `<div class="muted rr-small" style="margin-top:6px">Constraint: ${escapeHtml(constraint)}</div>` : ""}
      ${ratioNote ? `<div class="muted rr-small" style="margin-top:6px">${escapeHtml(ratioNote)}</div>` : ""}
      ${tasteNote ? `<div class="muted rr-small" style="margin-top:6px">${escapeHtml(tasteNote)}</div>` : ""}
    `;
    el.swapsList.appendChild(row);
  });
}

function renderOriginalRecipe(data) {
  // Best case: backend returns original recipe as data.original or data.recipe
  const original = data?.original || data?.recipe || null;
  const extracted = data?.extracted || {};

  const title = cleanText(original?.title || extracted?.title || "Original recipe");
  const srcUrl = cleanText(extracted?.sourceUrl || "");

  el.origTitle.textContent = `Original: ${title}`;

  renderMeta(el.origMeta, [
    { label: "Source", value: "open link", href: srcUrl || undefined },
    { label: "JSON-LD", value: extracted?.usedJsonLd ? "yes" : "no" }
  ].filter(x => x.href || x.label !== "Source"));

  clearNode(el.origIngredients);
  clearNode(el.origInstructions);

  if (!original || !Array.isArray(original.ingredients) || !original.ingredients.length) {
    // Don’t show dev instructions to end users — keep it simple.
    el.origIngredients.appendChild(liHtml(`<span class="muted">—</span>`));
  } else {
    const badTerms = (Array.isArray(data?.dbIssues) ? data.dbIssues.map(x => cleanText(x?.name)).filter(Boolean) : []);
    original.ingredients.slice(0, 80).forEach(lineRaw => {
      const line = cleanText(lineRaw);
      const url = extractUrl(lineRaw); // original raw may include URL; unlikely
      const textOnly = cleanText(removeUrlFromText(line));

      const html = highlightTermsHtml(textOnly, badTerms, "rr-bad");
      const link = url ? ` <a class="rr-link" href="${url}" target="_blank" rel="noopener">link</a>` : "";
      el.origIngredients.appendChild(liHtml(`${html}${link}`));
    });
  }

  if (!original || !Array.isArray(original.instructions) || !original.instructions.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "—";
    el.origInstructions.appendChild(li);
  } else {
    original.instructions.slice(0, 80).forEach(stepRaw => {
      const step = cleanText(stepRaw);
      const li = document.createElement("li");
      li.textContent = step;
      el.origInstructions.appendChild(li);
    });
  }
}

function renderRewrittenRecipe(data) {
  const rewritten = data?.result?.rewritten;
  if (!rewritten) return;

  const title = cleanText(rewritten.title || "Rewritten recipe");
  const servings = cleanText(rewritten.servings || "");

  el.newTitle.textContent = `Rewritten: ${title}`;

  const metaItems = [];
  if (servings) metaItems.push({ label: "Servings", value: servings });
  metaItems.push({ label: "Mode", value: cleanText(data?.mode || "rewrite") });
  metaItems.push({ label: "Strictness", value: cleanText(data?.prefs?.strictness || "") || cleanText(buildPrefs().strictness) });

  renderMeta(el.newMeta, metaItems);

  // Show swaps-at-top block
  renderSwapFastTop(data);

  clearNode(el.newIngredients);
  clearNode(el.newInstructions);
  clearNode(el.newNotes);

  const badTerms = (Array.isArray(data?.dbIssues) ? data.dbIssues.map(x => cleanText(x?.name)).filter(Boolean) : []);

  // Ingredients
  (Array.isArray(rewritten.ingredients) ? rewritten.ingredients : []).slice(0, 120).forEach(lineRaw => {
    const raw = String(lineRaw ?? "");
    const cleaned = cleanText(raw);
    const urlInLine = extractUrl(raw);

    // IMPORTANT: never let highlight touch URLs
    const textOnly = cleanText(removeUrlFromText(cleaned));
    let html = highlightTermsHtml(textOnly, badTerms, "rr-bad");

    // If sugar still appears, underline red + add a MonkVee suggestion
    const hasSugar = /\bsugar\b/i.test(textOnly) || /\bbrown sugar\b/i.test(textOnly) || /\bgranulated sugar\b/i.test(textOnly);

    // Build link (only if it's MonkVee)
    let linkHtml = "";
    if (urlInLine && urlInLine.includes("monkvee.com")) {
      linkHtml = ` <a class="rr-link" href="${urlInLine}" target="_blank" rel="noopener">MonkVee link</a>`;
    }

    const li = document.createElement("li");
    li.innerHTML = `${html}${linkHtml}`;

    // Add MonkVee suggestion line (green) when sugar is mentioned but no MonkVee link present
    if (hasSugar && !linkHtml) {
      const pick = pickMonkveeForSugar(textOnly);
      const sugg = document.createElement("div");
      sugg.className = "rr-small";
      sugg.style.marginTop = "6px";
      sugg.innerHTML = `Suggested: <a class="rr-link rr-good" href="${pick.url}" target="_blank" rel="noopener">${escapeHtml(pick.label)}</a>`;
      li.appendChild(sugg);
    }

    el.newIngredients.appendChild(li);
  });

  // Instructions
  (Array.isArray(rewritten.instructions) ? rewritten.instructions : []).slice(0, 120).forEach(stepRaw => {
    const step = cleanText(stepRaw);
    const li = document.createElement("li");
    li.textContent = step;
    el.newInstructions.appendChild(li);
  });

  // Notes
  (Array.isArray(rewritten.notes) ? rewritten.notes : []).slice(0, 80).forEach(noteRaw => {
    const note = cleanText(noteRaw);
    const li = document.createElement("li");
    li.textContent = note;
    el.newNotes.appendChild(li);
  });
}

function renderChangeLog(data) {
  clearNode(el.changeLog);
  const list = Array.isArray(data?.result?.changeLog) ? data.result.changeLog : [];
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "—";
    el.changeLog.appendChild(li);
    return;
  }

  list.slice(0, 30).forEach(x => {
    const change = cleanText(x?.change || "");
    const reason = cleanText(x?.reason || "");
    const taste = cleanText(x?.tasteImpact || "");
    const func = cleanText(x?.functionImpact || "");

    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>${escapeHtml(change)}</strong></div>
      ${reason ? `<div class="muted rr-small" style="margin-top:6px">Reason: ${escapeHtml(reason)}</div>` : ""}
      ${taste ? `<div class="muted rr-small" style="margin-top:6px">Taste: ${escapeHtml(taste)}</div>` : ""}
      ${func ? `<div class="muted rr-small" style="margin-top:6px">Function: ${escapeHtml(func)}</div>` : ""}
    `;
    el.changeLog.appendChild(li);
  });
}

/* -----------------------
   Main rehab call
------------------------ */
async function run(mode) {
  const recipeUrl = (el.url?.value || "").trim();
  if (!recipeUrl) {
    setErrorBox(el.issuesList, "Please paste a recipe URL.");
    return;
  }

  setLoading(true);

  try {
    const prefs = buildPrefs();
    const clientId = ensureClientId();

    const { cbName, url } = buildJsonpUrl({
      action: "rehab",
      mode,
      url: recipeUrl,
      clientId,
      prefs: JSON.stringify(prefs)
    });

    const data = await jsonp(url, cbName);

    if (!data || data.ok !== true) {
      const msg = cleanText(data?.error?.message || "Unknown error.");
      setErrorBox(el.issuesList, msg);
      setMutedBox(el.swapsList, "—");
      return;
    }

    // Render: issues + swaps + recipes + changelog
    renderIssues(data);
    renderSwaps(data);

    // NOTE: Original recipe requires backend to include `original` or `recipe` object.
    renderOriginalRecipe(data);
    renderRewrittenRecipe(data);
    renderChangeLog(data);

  } catch (err) {
    setErrorBox(el.issuesList, err?.message || String(err));
    setMutedBox(el.swapsList, "—");
  } finally {
    setLoading(false);
  }
}

/* -----------------------
   Admin endpoints
------------------------ */
function adminOpen() {
  el.adminDrawer?.classList?.remove("hidden");
}
function adminClose() {
  el.adminDrawer?.classList?.add("hidden");
}
async function adminCall(action, payloadObj) {
  const token = (el.adminToken?.value || "").trim();
  if (!token) throw new Error("Missing admin token.");

  const { cbName, url } = buildJsonpUrl({
    action,
    token,
    payload: JSON.stringify(payloadObj || {})
  });

  return await jsonp(url, cbName);
}

async function onAddBad() {
  try {
    el.badStatus.textContent = "Working…";
    const payload = {
      name: (el.badName.value || "").trim(),
      category: el.badCategory.value,
      notes: (el.badNotes.value || "").trim(),
      matchType: el.badMatchType.value
    };
    const res = await adminCall("admin_addBad", payload);
    if (!res || res.ok !== true) throw new Error(cleanText(res?.error?.message || "Failed."));
    el.badStatus.textContent = `✅ Added: ${payload.name}`;
  } catch (e) {
    el.badStatus.textContent = `❌ ${cleanText(e?.message || e)}`;
  }
}

async function onAddSwap() {
  try {
    el.swapStatus.textContent = "Working…";
    const payload = {
      triggers: (el.swapTriggers.value || "").trim(),
      swapTo: (el.swapTo.value || "").trim(),
      constraint: el.swapConstraint.value,
      ratioNote: (el.swapRatio.value || "").trim(),
      avoidIf: (el.swapAvoidIf.value || "").trim(),
      tasteNote: (el.swapTasteNote.value || "").trim()
    };
    const res = await adminCall("admin_addSwap", payload);
    if (!res || res.ok !== true) throw new Error(cleanText(res?.error?.message || "Failed."));
    el.swapStatus.textContent = `✅ Added swap: ${payload.triggers} → ${payload.swapTo}`;
  } catch (e) {
    el.swapStatus.textContent = `❌ ${cleanText(e?.message || e)}`;
  }
}

async function onAdminList(type) {
  try {
    el.adminOut.textContent = "Loading…";
    const res = await adminCall("admin_list", { type, limit: 100 });
    if (!res || res.ok !== true) throw new Error(cleanText(res?.error?.message || "Failed."));
    el.adminOut.textContent = JSON.stringify(res.items || [], null, 2);
  } catch (e) {
    el.adminOut.textContent = `Error: ${cleanText(e?.message || e)}`;
  }
}

/* -----------------------
   Wire events
------------------------ */
(function init() {
  // Main buttons
  el.go?.addEventListener("click", () => run("rewrite"));
  el.scanOnly?.addEventListener("click", () => run("scan"));
  el.url?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run("rewrite");
  });

  // Admin drawer
  el.toggleAdmin?.addEventListener("click", adminOpen);
  el.closeAdmin?.addEventListener("click", adminClose);

  el.addBad?.addEventListener("click", onAddBad);
  el.addSwap?.addEventListener("click", onAddSwap);
  el.adminListBad?.addEventListener("click", () => onAdminList("bad"));
  el.adminListSwaps?.addEventListener("click", () => onAdminList("swaps"));

  // Default placeholders
  if (el.issuesList?.textContent?.trim() === "—") setMutedBox(el.issuesList, "—");
  if (el.swapsList?.textContent?.trim() === "—") setMutedBox(el.swapsList, "—");
})();
