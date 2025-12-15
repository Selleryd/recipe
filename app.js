const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwHit5eCifvBli8xuQyuQ25xUYF61p5HeuMFbQwAuH3A4ZKFvgiGRfYE4IQ5G3oVF81/exec";

const MONKVEE_URLS = [
  "https://monkvee.com/products/stevia-extract",
  "https://monkvee.com/products/monk-fruit-sugar-golden",
  "https://monkvee.com/products/monk-fruit-sweetener-original",
  "https://monkvee.com/products/monk-fruit-extract"
];

function el(id){ return document.getElementById(id); }

function getClientId(){
  const k="rrClientId";
  let v=localStorage.getItem(k);
  if(!v){ v="c_"+Math.random().toString(16).slice(2)+Date.now().toString(16); localStorage.setItem(k,v); }
  return v;
}

function setBusy(on){
  el("go").disabled = on;
  el("scanOnly").disabled = on;
  el("go").textContent = on ? "Working..." : "Analyze + Rewrite";
}

function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb="rr_cb_"+Math.random().toString(16).slice(2);
    window[cb]=(data)=>{ cleanup(); resolve(data); };
    const s=document.createElement("script");
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    s.onerror=()=>{ cleanup(); reject(new Error("Network error loading JSONP.")); };
    function cleanup(){ try{delete window[cb];}catch(e){} if(s.parentNode) s.parentNode.removeChild(s); }
    document.body.appendChild(s);
  });
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function linkifyMonkVee(text){
  let out = escapeHtml(text);
  for(const url of MONKVEE_URLS){
    const safe = escapeHtml(url);
    out = out.replaceAll(safe, `<a href="${safe}" target="_blank" rel="noopener">MonkVee product</a>`);
  }
  return out;
}

function normalize(s){
  return String(s||"").toLowerCase().replace(/®|™|℠/g,"").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}

function collectIssueNeedles(res){
  const needles = new Set();
  (res.dbIssues || []).forEach(x => needles.add(normalize(x.name)));
  // also consider swap triggers as "bad needles" for highlighting
  (res.swapSuggestions || []).forEach(s => needles.add(normalize(s.trigger)));
  return Array.from(needles).filter(Boolean);
}

function swapsForLine(line, swapSuggestions){
  const n = normalize(line);
  const hits = [];
  for(const s of (swapSuggestions || [])){
    const trig = normalize(s.trigger);
    if(!trig) continue;
    if(n.includes(trig)) hits.push(s);
  }
  return hits;
}

function highlightBad(line, needles){
  let html = escapeHtml(line);
  const lower = normalize(line);
  for(const needle of needles){
    if(!needle) continue;
    if(!lower.includes(needle)) continue;

    // best-effort highlight: wrap the exact substring occurrences (case-insensitive)
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "ig");
    html = html.replace(re, (m)=>`<span class="bad">${escapeHtml(m)}</span>`);
  }
  return html;
}

function clearRecipeUI(){
  el("issuesList").textContent = "—";
  el("swapsList").textContent = "—";

  el("origTitle").textContent = "Original recipe";
  el("origMeta").textContent = "";
  el("origIngredients").innerHTML = "";
  el("origInstructions").innerHTML = "";

  el("newTitle").textContent = "Rewritten recipe";
  el("newMeta").textContent = "";
  el("newIngredients").innerHTML = "";
  el("newInstructions").innerHTML = "";
  el("newNotes").innerHTML = "";

  el("changeLog").innerHTML = "";
}

function renderError(msg){
  clearRecipeUI();
  el("issuesList").textContent = msg || "Unknown error";
}

function renderUser(res){
  if(!res || !res.ok){
    renderError(res?.error?.message || "Unknown error");
    return;
  }

  // Issues panel
  const dbIssues = res.dbIssues || [];
  const aiIssues = res.result?.issues || [];
  const issueLines = [];

  // Prefer showing AI issues if present, else db issues
  if(aiIssues.length){
    for(const it of aiIssues){
      issueLines.push(`[${it.category} / ${it.severity}] ${it.finding} — ${it.why}`);
    }
  } else if(dbIssues.length){
    for(const it of dbIssues){
      issueLines.push(`[${it.category}] ${it.name}${it.notes ? " — " + it.notes : ""}`);
    }
  } else {
    issueLines.push("No matches found from your database (built-in MonkVee swaps may still apply).");
  }
  el("issuesList").innerHTML = issueLines.map(x=>`<div>${escapeHtml(x)}</div>`).join("");

  // Swaps panel
  const swaps = res.swapSuggestions || [];
  if(swaps.length){
    el("swapsList").innerHTML = swaps.map(s=>{
      const parts = [];
      parts.push(`<div><span class="good">Swap:</span> ${escapeHtml(s.swapTo || "")}</div>`);
      if(s.productUrl && MONKVEE_URLS.includes(s.productUrl)){
        parts.push(`<div class="muted smallText"><a href="${escapeHtml(s.productUrl)}" target="_blank" rel="noopener">View MonkVee product</a></div>`);
      }
      if(s.ratioNote) parts.push(`<div class="muted smallText">Note: ${escapeHtml(s.ratioNote)}</div>`);
      if(s.constraint) parts.push(`<div class="muted smallText">Constraint: ${escapeHtml(s.constraint)}</div>`);
      return `<div class="card" style="padding:12px;border-radius:14px;">${parts.join("")}</div>`;
    }).join("");
  } else {
    el("swapsList").textContent = "No swap rules matched.";
  }

  // Original recipe (extracted)
  const ex = res.extracted || {};
  el("origTitle").textContent = ex.title ? `Original: ${ex.title}` : "Original recipe";
  el("origMeta").textContent = ex.sourceUrl ? ex.sourceUrl : "";

  const needles = collectIssueNeedles(res);

  // NOTE: your backend doesn’t currently return original instructions/ingredients separately,
  // but you DO have them internally. We display what we can from extracted title.
  // If you want original ingredients/instructions displayed, I’ll add them to the response in the backend next.
  // For now, we show ingredient highlights based on the rewritten original-ish data if present.
  // (Below we’ll render using res.result.rewritten only for rewritten.)

  // Rewritten recipe (AI)
  const r = res.result?.rewritten;
  if(r){
    el("newTitle").textContent = r.title ? `Rewritten: ${r.title}` : "Rewritten recipe";
    el("newMeta").textContent = r.servings ? `Servings: ${r.servings}` : "";

    // Ingredients with highlighting + swap hints (green)
    el("newIngredients").innerHTML = (r.ingredients || []).map(line=>{
      const lineSwaps = swapsForLine(line, swaps);
      const swapHint = lineSwaps.length ? lineSwaps[0] : null;

      const htmlLine = highlightBad(line, needles);
      const swapLine = swapHint
        ? `<div class="swapHint">Suggested: <span class="good">${escapeHtml(swapHint.swapTo || "")}</span>${
            swapHint.productUrl && MONKVEE_URLS.includes(swapHint.productUrl)
              ? ` • <a href="${escapeHtml(swapHint.productUrl)}" target="_blank" rel="noopener">MonkVee link</a>`
              : ""
          }</div>`
        : "";

      return `<li><div class="ingLine"><div>${linkifyMonkVee(htmlLine)}</div>${swapLine}</div></li>`;
    }).join("");

    // Instructions
    el("newInstructions").innerHTML = (r.instructions || []).map(step=>{
      return `<li>${linkifyMonkVee(step)}</li>`;
    }).join("");

    // Notes
    el("newNotes").innerHTML = (r.notes || []).map(n=>{
      return `<li>${linkifyMonkVee(n)}</li>`;
    }).join("");
  }

  // Change log
  const cl = res.result?.changeLog || [];
  el("changeLog").innerHTML = cl.length ? cl.map(c=>{
    const line =
      `<div><strong>${escapeHtml(c.change)}</strong></div>` +
      `<div class="muted smallText">Reason: ${escapeHtml(c.reason)}</div>` +
      `<div class="muted smallText">Taste: ${escapeHtml(c.tasteImpact)}</div>` +
      `<div class="muted smallText">Function: ${escapeHtml(c.functionImpact)}</div>`;
    return `<li>${line}</li>`;
  }).join("") : `<li class="muted">—</li>`;

  // We currently aren’t rendering original ingredients/instructions because the backend response
  // doesn’t include them. Next section shows how to add them cleanly.
}

async function run(mode){
  const url = el("url").value.trim();
  if(!url) return renderError("Paste a recipe URL first.");

  const prefs = {
    strictness: el("strictness").value,
    avoidSeedOils: el("avoidSeedOils").checked,
    lowerAddedSugar: el("lowerSugar").checked,
    avoidArtificialDyes: el("avoidDyes").checked,
    avoidUltraProcessed: el("avoidUltraProcessed").checked
  };

  setBusy(true);
  try{
    const qs =
      "action=rehab" +
      "&mode=" + encodeURIComponent(mode) +
      "&url=" + encodeURIComponent(url) +
      "&clientId=" + encodeURIComponent(getClientId()) +
      "&prefs=" + encodeURIComponent(JSON.stringify(prefs));

    const full = GAS_WEBAPP_URL + (GAS_WEBAPP_URL.includes("?") ? "&" : "?") + qs;
    const res = await jsonp(full);
    renderUser(res);
  }catch(err){
    renderError(String(err?.message||err));
  }finally{
    setBusy(false);
  }
}

// Admin drawer
function openAdmin(){ el("adminDrawer").classList.remove("hidden"); }
function closeAdmin(){ el("adminDrawer").classList.add("hidden"); }

async function adminCall(action, payloadObj){
  const token = el("adminToken").value.trim();
  if(!token) throw new Error("Admin token required.");

  const qs =
    "action=" + encodeURIComponent(action) +
    "&token=" + encodeURIComponent(token) +
    "&clientId=" + encodeURIComponent(getClientId()) +
    "&payload=" + encodeURIComponent(JSON.stringify(payloadObj || {}));

  const full = GAS_WEBAPP_URL + (GAS_WEBAPP_URL.includes("?") ? "&" : "?") + qs;
  return await jsonp(full);
}

async function addBad(){
  el("badStatus").textContent = "Working...";
  try{
    const payload = {
      name: el("badName").value.trim(),
      category: el("badCategory").value,
      notes: el("badNotes").value.trim(),
      matchType: el("badMatchType").value
    };
    const res = await adminCall("admin_addBad", payload);
    el("badStatus").textContent = JSON.stringify(res, null, 2);
  }catch(e){
    el("badStatus").textContent = String(e?.message || e);
  }
}

async function addSwap(){
  el("swapStatus").textContent = "Working...";
  try{
    const payload = {
      triggers: el("swapTriggers").value.trim(),
      swapTo: el("swapTo").value.trim(),
      constraint: el("swapConstraint").value,
      ratioNote: el("swapRatio").value.trim(),
      avoidIf: el("swapAvoidIf").value.trim(),
      tasteNote: el("swapTasteNote").value.trim()
    };
    const res = await adminCall("admin_addSwap", payload);
    el("swapStatus").textContent = JSON.stringify(res, null, 2);
  }catch(e){
    el("swapStatus").textContent = String(e?.message || e);
  }
}

async function adminList(type){
  el("adminOut").textContent = "Working...";
  try{
    const res = await adminCall("admin_list", { type, limit: 50 });
    el("adminOut").textContent = JSON.stringify(res, null, 2);
  }catch(e){
    el("adminOut").textContent = String(e?.message || e);
  }
}

el("go").addEventListener("click", ()=>run("rewrite"));
el("scanOnly").addEventListener("click", ()=>run("scan"));
el("toggleAdmin").addEventListener("click", openAdmin);
el("closeAdmin").addEventListener("click", closeAdmin);
el("addBad").addEventListener("click", addBad);
el("addSwap").addEventListener("click", addSwap);
el("adminListBad").addEventListener("click", ()=>adminList("bad"));
el("adminListSwaps").addEventListener("click", ()=>adminList("swaps"));
