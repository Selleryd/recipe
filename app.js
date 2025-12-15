/***********************
 * Recipe Rehab — app.js (DROP-IN REPLACEMENT)
 * - JSONP call to Apps Script backend
 * - Clean recipe rendering (real recipe layout)
 * - Fixes:
 *   • Decodes funky characters (&#39; etc.)
 *   • Never highlights inside URLs (no <span> inside links)
 *   • Highlights “bad” terms in RED underline + suggested swaps in GREEN underline
 *   • Shows “What changed” (swap summary) at the TOP
 *   • Hides Raw JSON (if it exists in your HTML)
 ***********************/

// ✅ KEEP THIS AS YOUR STABLE /exec URL
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwHit5eCifvBli8xuQyuQ25xUYF61p5HeuMFbQwAuH3A4ZKFvgiGRfYE4IQ5G3oVF81/exec";

/* -----------------------
   Small style injection
------------------------ */
(function injectStyles() {
  const css = `
    .bad-underline{color:#ff4d4d;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
    .good-underline{color:#22c55e;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
    .rr-muted{opacity:.85}
    .rr-small{font-size:12px;opacity:.9}
    .rr-pill{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border-radius:999px;
      border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-size:12px}
    .rr-pill.high{color:#ff4d4d}.rr-pill.medium{color:#f59e0b}.rr-pill.low{color:#93c5fd}
    .rr-kv{display:flex;gap:10px;flex-wrap:wrap}
    .rr-box{padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04)}
    .rr-list{margin:10px 0 0 18px}
    .rr-ol{margin:10px 0 0 18px}
    .rr-link{color:#7dd3fc;text-decoration:underline}
    .rr-swap-summary{margin:14px 0 0}
    .rr-swap-summary h3{margin:0 0 8px;font-size:16px}
    .rr-swap-summary ul{margin:8px 0 0 18px}
    .rr-error{color:#ffb4b4}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* -----------------------
   Helpers
------------------------ */
function $(sel) { return document.querySelector(sel); }
function $any(selectors) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

function decodeEntities(str) {
  const t = document.createElement("textarea");
  t.innerHTML = String(str ?? "");
  return t.value;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Return first URL in a string (if any)
function extractUrl(line) {
  const m = String(line ?? "").match(/https?:\/\/\S+/);
  return m ? m[0] : "";
}

// Remove URL from the visible text
function removeUrlFromText(line) {
  const url = extractUrl(line);
  if (!url) return String(line ?? "").trim();
  return String(line ?? "").replace(url, "").replace(/\s+/g, " ").trim();
}

// Split the line into "text" and "url"
function splitUrl(line) {
  const url = extractUrl(line);
  return { text: removeUrlFromText(line), url };
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/®|™|℠/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Highlight terms ONLY in non-URL text
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

function ensureClientId() {
  const k = "rr_client_id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = "c_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(k, v);
  }
  return v;
}

function hideRawJsonIfExists() {
  // If your HTML has a Raw JSON panel, this hides it without you touching HTML.
  const candidates = [
    "#rawJsonCard", "#rawJson", ".raw-json", "[data-raw-json]", "[data-role='raw-json']"
  ];
  const el = $any(candidates);
  if (el) el.style.display = "none";

  // If it’s a header + box, hide the nearest card-like container
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,div"));
  const h = headings.find(x => (x.textContent || "").trim().toLowerCase() === "raw json");
  if (h) {
    const card = h.closest(".card, .panel, .rr-box, section, article, div");
    if (card) card.style.display = "none";
  }
}

/* -----------------------
   DOM lookups (works with most layouts)
------------------------ */
const DOM = {
  // Inputs
  url: $any(["#recipeUrl", "input[name='recipeUrl']", "input[data-role='recipeUrl']"]),
  strictness: $any(["#strictness", "select[name='strictness']", "select[data-role='strictness']"]),
  avoidSeedOils: $any(["#avoidSeedOils", "input[name='avoidSeedOils']"]),
  lowerAddedSugar: $any(["#lowerAddedSugar", "input[name='lowerAddedSugar']"]),
  avoidArtificialDyes: $any(["#avoidArtificialDyes", "input[name='avoidArtificialDyes']"]),
  avoidUltraProcessed: $any(["#avoidUltraProcessed", "input[name='avoidUltraProcessed']"]),

  btnRewrite: $any(["#btnRewrite", "#analyzeRewrite", "button[data-action='rewrite']"]),
  btnScan: $any(["#btnScan", "#scanOnly", "button[data-action='scan']"]),

  // Output cards/containers
  issuesBox: $any(["#issuesBox", "#issues", ".js-issues", "[data-role='issues']"]),
  swapsBox: $any(["#swapsBox", "#swaps", ".js-swaps", "[data-role='swaps']"]),

  origTitle: $any(["#origTitle", ".js-orig-title", "[data-role='orig-title']"]),
  origUrl: $any(["#origUrl", ".js-orig-url", "[data-role='orig-url']"]),
  origIngredients: $any(["#origIngredients", ".js-orig-ingredients", "[data-role='orig-ingredients']"]),
  origInstructions: $any(["#origInstructions", ".js-orig-instructions", "[data-role='orig-instructions']"]),

  newTitle: $any(["#newTitle", ".js-new-title", "[data-role='new-title']"]),
  newServings: $any(["#newServings", ".js-new-servings", "[data-role='new-servings']"]),
  newIngredients: $any(["#newIngredients", ".js-new-ingredients", "[data-role='new-ingredients']"]),
  newInstructions: $any(["#newInstructions", ".js-new-instructions", "[data-role='new-instructions']"]),
  newNotes: $any(["#newNotes", ".js-new-notes", "[data-role='new-notes']"]),

  changeLog: $any(["#changeLog", ".js-change-log", "[data-role='change-log']"]),

  // Where we can insert “What changed” summary
  summaryMount: $any(["#summaryMount", ".js-summary", "[data-role='summary']"]) ||
                $any(["#rewrittenCard", ".rewritten", "[data-role='rewritten']"]) ||
                document.body
};

// If your HTML doesn’t have placeholders, we create a fallback results UI
function ensureFallbackResultsUI() {
  let root = $("#rrResultsRoot");
  if (root) return root;

  // Find a sensible mount: inside .wrap if present, else body
  const mount = $any([".wrap", "#app", "main", "body"]);
  root = document.createElement("div");
  root.id = "rrResultsRoot";
  root.style.marginTop = "18px";
  root.innerHTML = `
    <div class="rr-swap-summary rr-box" id="rrSwapSummary" style="display:none"></div>
    <div class="rr-box" id="rrIssuesFallback" style="margin-top:14px"></div>
    <div class="rr-box" id="rrSwapsFallback" style="margin-top:14px"></div>
    <div class="rr-box" id="rrOriginalFallback" style="margin-top:14px"></div>
    <div class="rr-box" id="rrRewrittenFallback" style="margin-top:14px"></div>
    <div class="rr-box" id="rrChangeLogFallback" style="margin-top:14px"></div>
  `;
  mount.appendChild(root);

  // Wire fallback targets if missing
  DOM.issuesBox = DOM.issuesBox || $("#rrIssuesFallback");
  DOM.swapsBox = DOM.swapsBox || $("#rrSwapsFallback");
  DOM.changeLog = DOM.changeLog || $("#rrChangeLogFallback");

  // For recipe sections, we’ll fill these fallback boxes with full markup
  return root;
}

/* -----------------------
   Rendering
------------------------ */
function setLoading(isLoading) {
  if (DOM.btnRewrite) DOM.btnRewrite.disabled = isLoading;
  if (DOM.btnScan) DOM.btnScan.disabled = isLoading;

  const msg = isLoading ? "Working…" : "";
  // Put a small status into issues box if we can
  if (isLoading && DOM.issuesBox) {
    DOM.issuesBox.innerHTML = `<div class="rr-muted rr-small">Working… extracting recipe and rewriting.</div>`;
  }
}

function renderError(message) {
  ensureFallbackResultsUI();
  hideRawJsonIfExists();
  if (DOM.issuesBox) {
    DOM.issuesBox.innerHTML = `<div class="rr-error">Error: ${escapeHtml(message)}</div>`;
  }
}

function renderSwapSummary(data) {
  // Goal: show all swaps/changes at the TOP immediately.
  const changes = [];

  const changeLog = data?.result?.changeLog;
  if (Array.isArray(changeLog)) {
    for (const c of changeLog) {
      if (c?.change) changes.push(String(c.change));
    }
  }

  // Add swap rules matched (db swaps)
  const swaps = data?.swapSuggestions;
  if (Array.isArray(swaps)) {
    for (const s of swaps) {
      if (s?.trigger && s?.swapTo) changes.push(`${s.trigger} → ${s.swapTo}`);
    }
  }

  // Deduplicate and keep it tight
  const seen = new Set();
  const clean = [];
  for (const x of changes) {
    const k = normalizeText(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    clean.push(x.trim());
    if (clean.length >= 10) break;
  }

  // Create / locate summary container
  let summary = $("#rrSwapSummary");
  if (!summary) {
    // Try to insert into existing UI if available
    summary = document.createElement("div");
    summary.id = "rrSwapSummary";
    summary.className = "rr-swap-summary rr-box";
    const mount =
      DOM.summaryMount?.querySelector?.(".rr-swap-summary") ||
      DOM.summaryMount ||
      document.body;
    // Insert before mount's first child if possible
    if (mount && mount.firstChild) mount.insertBefore(summary, mount.firstChild);
    else document.body.insertBefore(summary, document.body.firstChild);
  }

  if (!clean.length) {
    summary.style.display = "none";
    return;
  }

  summary.style.display = "";
  summary.innerHTML = `
    <h3>What changed (fast)</h3>
    <div class="rr-muted rr-small">Top swaps / adjustments applied to make this healthier without breaking function.</div>
    <ul>
      ${clean.map(x => `<li>${escapeHtml(decodeEntities(x))}</li>`).join("")}
    </ul>
  `;
}

function renderIssues(data) {
  ensureFallbackResultsUI();

  const issues = Array.isArray(data?.result?.issues) ? data.result.issues : [];
  const dbIssues = Array.isArray(data?.dbIssues) ? data.dbIssues : [];

  // If AI issues exist, prefer them; otherwise show db scan issues.
  if (issues.length) {
    DOM.issuesBox.innerHTML = issues.map(i => {
      const sev = (i?.severity || "low").toLowerCase();
      const cat = String(i?.category || "other");
      const finding = decodeEntities(i?.finding || "");
      const fix = decodeEntities(i?.recommendedFix || "");
      const why = decodeEntities(i?.why || "");
      const evidence = decodeEntities(i?.evidence || "");

      return `
        <div class="rr-box" style="margin-bottom:10px">
          <div class="rr-kv">
            <span class="rr-pill ${sev}">${escapeHtml(cat)} / ${escapeHtml(sev)}</span>
            ${finding ? `<span class="bad-underline">${escapeHtml(finding)}</span>` : ""}
          </div>
          ${why ? `<div class="rr-muted" style="margin-top:8px">${escapeHtml(why)}</div>` : ""}
          ${evidence ? `<div class="rr-small rr-muted" style="margin-top:6px">Evidence: ${escapeHtml(evidence)}</div>` : ""}
          ${fix ? `<div style="margin-top:8px">Fix: <span class="good-underline">${escapeHtml(fix)}</span></div>` : ""}
        </div>
      `;
    }).join("");
    return;
  }

  // Fallback: dbIssues list
  if (!dbIssues.length) {
    DOM.issuesBox.innerHTML = `<div class="rr-muted">No matches found from your database.</div>`;
    return;
  }

  DOM.issuesBox.innerHTML = `
    <div class="rr-muted rr-small">Flagged from your database:</div>
    <ul class="rr-list">
      ${dbIssues.slice(0, 40).map(x => {
        const name = decodeEntities(x?.name || "");
        const cat = decodeEntities(x?.category || "other");
        return `<li><span class="bad-underline">${escapeHtml(name)}</span> <span class="rr-small rr-muted">(${escapeHtml(cat)})</span></li>`;
      }).join("")}
    </ul>
  `;
}

function renderSwaps(data) {
  ensureFallbackResultsUI();

  const swaps = Array.isArray(data?.swapSuggestions) ? data.swapSuggestions : [];
  if (!swaps.length) {
    DOM.swapsBox.innerHTML = `<div class="rr-muted">No swap rules matched.</div>`;
    return;
  }

  DOM.swapsBox.innerHTML = swaps.slice(0, 40).map(s => {
    const trigger = decodeEntities(s?.trigger || "");
    const swapTo = decodeEntities(s?.swapTo || "");
    const ratioNote = decodeEntities(s?.ratioNote || "");
    const constraint = decodeEntities(s?.constraint || "");
    const tasteNote = decodeEntities(s?.tasteNote || "");
    return `
      <div class="rr-box" style="margin-bottom:10px">
        <div><span class="bad-underline">${escapeHtml(trigger)}</span></div>
        <div style="margin-top:6px">Suggested: <span class="good-underline">${escapeHtml(swapTo)}</span></div>
        ${constraint ? `<div class="rr-small rr-muted" style="margin-top:6px">Constraint: ${escapeHtml(constraint)}</div>` : ""}
        ${ratioNote ? `<div class="rr-small rr-muted" style="margin-top:6px">${escapeHtml(ratioNote)}</div>` : ""}
        ${tasteNote ? `<div class="rr-small rr-muted" style="margin-top:6px">${escapeHtml(tasteNote)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function renderOriginalRecipe(data) {
  ensureFallbackResultsUI();

  const original = data?.original; // ✅ requires backend to send original (recommended)
  const extracted = data?.extracted || {};
  const title = decodeEntities(original?.title || extracted?.title || "Original recipe");
  const srcUrl = extracted?.sourceUrl || "";

  const ingredients = Array.isArray(original?.ingredients) ? original.ingredients : [];
  const instructions = Array.isArray(original?.instructions) ? original.instructions : [];

  // Bad terms to underline in original
  const badTerms = Array.isArray(data?.dbIssues) ? data.dbIssues.map(x => x?.name).filter(Boolean) : [];

  // If your HTML has dedicated placeholders:
  if (DOM.origTitle || DOM.origIngredients || DOM.origInstructions) {
    if (DOM.origTitle) DOM.origTitle.textContent = title;
    if (DOM.origUrl && srcUrl) DOM.origUrl.textContent = srcUrl;
    if (DOM.origIngredients) {
      DOM.origIngredients.innerHTML = ingredients.length
        ? `<ul class="rr-list">${ingredients.map(line => {
            const { text, url } = splitUrl(line);
            const html = highlightTermsHtml(text, badTerms, "bad-underline");
            const link = url ? ` <a class="rr-link" href="${url}" target="_blank" rel="noopener">link</a>` : "";
            return `<li>${html}${link}</li>`;
          }).join("")}</ul>`
        : `<div class="rr-muted rr-small">Original ingredients not available (update backend to return <code>original</code>).</div>`;
    }
    if (DOM.origInstructions) {
      DOM.origInstructions.innerHTML = instructions.length
        ? `<ol class="rr-ol">${instructions.map(s => `<li>${escapeHtml(decodeEntities(s))}</li>`).join("")}</ol>`
        : `<div class="rr-muted rr-small">Original instructions not available (update backend to return <code>original</code>).</div>`;
    }
    return;
  }

  // Fallback render into our injected box
  const box = $("#rrOriginalFallback");
  if (!box) return;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;font-size:18px">Original: ${escapeHtml(title)}</div>
        ${srcUrl ? `<div class="rr-small rr-muted"><a class="rr-link" href="${srcUrl}" target="_blank" rel="noopener">${escapeHtml(srcUrl)}</a></div>` : ""}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
      <div>
        <div style="font-weight:700;margin-bottom:6px">Ingredients</div>
        ${ingredients.length ? `
          <ul class="rr-list">
            ${ingredients.map(line => {
              const { text, url } = splitUrl(line);
              const html = highlightTermsHtml(text, badTerms, "bad-underline");
              const link = url ? ` <a class="rr-link" href="${url}" target="_blank" rel="noopener">link</a>` : "";
              return `<li>${html}${link}</li>`;
            }).join("")}
          </ul>
        ` : `<div class="rr-muted rr-small">Original ingredients not available (backend must return <code>original</code>).</div>`}
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:6px">Instructions</div>
        ${instructions.length ? `
          <ol class="rr-ol">
            ${instructions.map(s => `<li>${escapeHtml(decodeEntities(s))}</li>`).join("")}
          </ol>
        ` : `<div class="rr-muted rr-small">Original instructions not available (backend must return <code>original</code>).</div>`}
      </div>
    </div>
  `;
}

function renderRewrittenRecipe(data) {
  ensureFallbackResultsUI();

  const rewritten = data?.result?.rewritten;
  if (!rewritten) return;

  const title = decodeEntities(rewritten.title || "Rewritten recipe");
  const servings = decodeEntities(rewritten.servings || "");
  const ingredients = Array.isArray(rewritten.ingredients) ? rewritten.ingredients : [];
  const instructions = Array.isArray(rewritten.instructions) ? rewritten.instructions : [];
  const notes = Array.isArray(rewritten.notes) ? rewritten.notes : [];

  // Underline original "bad" terms if they appear in rewritten text too (rare, but still)
  const badTerms = Array.isArray(data?.dbIssues) ? data.dbIssues.map(x => x?.name).filter(Boolean) : [];

  // If your HTML has placeholders:
  if (DOM.newTitle || DOM.newIngredients || DOM.newInstructions) {
    if (DOM.newTitle) DOM.newTitle.textContent = title;
    if (DOM.newServings) DOM.newServings.textContent = servings;

    if (DOM.newIngredients) {
      DOM.newIngredients.innerHTML = ingredients.length
        ? `<ul class="rr-list">${ingredients.map(line => {
            const { text, url } = splitUrl(line);
            const cleanText = decodeEntities(text);
            const html = highlightTermsHtml(cleanText, badTerms, "bad-underline");
            const link = url ? ` <a class="rr-link" href="${url}" target="_blank" rel="noopener">MonkVee link</a>` : "";
            return `<li>${html}${link}</li>`;
          }).join("")}</ul>`
        : `<div class="rr-muted">—</div>`;
    }

    if (DOM.newInstructions) {
      DOM.newInstructions.innerHTML = instructions.length
        ? `<ol class="rr-ol">${instructions.map(s => `<li>${escapeHtml(decodeEntities(s))}</li>`).join("")}</ol>`
        : `<div class="rr-muted">—</div>`;
    }

    if (DOM.newNotes) {
      DOM.newNotes.innerHTML = notes.length
        ? `<ul class="rr-list">${notes.map(n => `<li>${escapeHtml(decodeEntities(n))}</li>`).join("")}</ul>`
        : `<div class="rr-muted">—</div>`;
    }
    return;
  }

  // Fallback render into injected box
  const box = $("#rrRewrittenFallback");
  if (!box) return;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;font-size:18px">Rewritten: ${escapeHtml(title)}</div>
      </div>
      ${servings ? `<div class="rr-small rr-muted">Servings: ${escapeHtml(servings)}</div>` : ""}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
      <div>
        <div style="font-weight:700;margin-bottom:6px">Ingredients</div>
        <ul class="rr-list">
          ${ingredients.map(line => {
            const { text, url } = splitUrl(line);
            const cleanText = decodeEntities(text);
            const html = highlightTermsHtml(cleanText, badTerms, "bad-underline");
            const link = url ? ` <a class="rr-link" href="${url}" target="_blank" rel="noopener">MonkVee link</a>` : "";
            return `<li>${html}${link}</li>`;
          }).join("")}
        </ul>
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:6px">Instructions</div>
        <ol class="rr-ol">
          ${instructions.map(s => `<li>${escapeHtml(decodeEntities(s))}</li>`).join("")}
        </ol>
      </div>
    </div>

    <div style="margin-top:14px">
      <div style="font-weight:700;margin-bottom:6px">Notes</div>
      ${notes.length ? `<ul class="rr-list">${notes.map(n => `<li>${escapeHtml(decodeEntities(n))}</li>`).join("")}</ul>` : `<div class="rr-muted">—</div>`}
    </div>
  `;
}

function renderChangeLog(data) {
  ensureFallbackResultsUI();

  const list = Array.isArray(data?.result?.changeLog) ? data.result.changeLog : [];
  if (!DOM.changeLog) return;

  if (!list.length) {
    DOM.changeLog.innerHTML = `<div class="rr-muted">—</div>`;
    return;
  }

  DOM.changeLog.innerHTML = `
    <ol class="rr-ol">
      ${list.slice(0, 20).map(x => {
        const change = decodeEntities(x?.change || "");
        const reason = decodeEntities(x?.reason || "");
        const taste = decodeEntities(x?.tasteImpact || "");
        const func = decodeEntities(x?.functionImpact || "");
        return `
          <li style="margin-bottom:10px">
            <div><strong>${escapeHtml(change)}</strong></div>
            ${reason ? `<div class="rr-muted rr-small">Reason: ${escapeHtml(reason)}</div>` : ""}
            ${taste ? `<div class="rr-muted rr-small">Taste: ${escapeHtml(taste)}</div>` : ""}
            ${func ? `<div class="rr-muted rr-small">Function: ${escapeHtml(func)}</div>` : ""}
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

/* -----------------------
   JSONP transport
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

/* -----------------------
   Main action
------------------------ */
async function run(mode) {
  ensureFallbackResultsUI();
  hideRawJsonIfExists();

  const recipeUrl = (DOM.url?.value || "").trim();
  if (!recipeUrl) return renderError("Please paste a recipe URL.");

  const prefs = {
    avoidSeedOils: !!DOM.avoidSeedOils?.checked,
    lowerAddedSugar: !!DOM.lowerAddedSugar?.checked,
    avoidArtificialDyes: !!DOM.avoidArtificialDyes?.checked,
    avoidUltraProcessed: !!DOM.avoidUltraProcessed?.checked,
    strictness: DOM.strictness?.value || "balanced"
  };

  setLoading(true);

  try {
    const clientId = ensureClientId();
    const cbName = "__rr_cb_" + Math.random().toString(16).slice(2);

    const qs =
      `action=rehab` +
      `&mode=${encodeURIComponent(mode)}` +
      `&url=${encodeURIComponent(recipeUrl)}` +
      `&clientId=${encodeURIComponent(clientId)}` +
      `&prefs=${encodeURIComponent(JSON.stringify(prefs))}` +
      `&callback=${encodeURIComponent(cbName)}` +
      `&_=${Date.now()}`;

    const fullUrl = `${GAS_WEBAPP_URL}${GAS_WEBAPP_URL.includes("?") ? "&" : "?"}${qs}`;

    const data = await jsonp(fullUrl, cbName);

    if (!data || data.ok !== true) {
      const msg = data?.error?.message || "Unknown error.";
      renderError(msg);
      return;
    }

    // TOP: swaps summary
    renderSwapSummary(data);

    // Cards
    renderIssues(data);
    renderSwaps(data);

    // Recipes
    renderOriginalRecipe(data);
    renderRewrittenRecipe(data);

    // Change log
    renderChangeLog(data);

  } catch (err) {
    renderError(err?.message || String(err));
  } finally {
    setLoading(false);
  }
}

/* -----------------------
   Wire events
------------------------ */
(function init() {
  ensureFallbackResultsUI();
  hideRawJsonIfExists();

  if (DOM.btnRewrite) DOM.btnRewrite.addEventListener("click", () => run("rewrite"));
  if (DOM.btnScan) DOM.btnScan.addEventListener("click", () => run("scan"));

  // Optional: Enter key triggers rewrite
  if (DOM.url) {
    DOM.url.addEventListener("keydown", (e) => {
      if (e.key === "Enter") run("rewrite");
    });
  }
})();
