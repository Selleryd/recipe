// Paste your Apps Script Web App /exec URL here:
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwHit5eCifvBli8xuQyuQ25xUYF61p5HeuMFbQwAuH3A4ZKFvgiGRfYE4IQ5G3oVF81/exec";

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

function renderUser(res){
  el("raw").textContent = JSON.stringify(res, null, 2);

  if(!res.ok){
    el("dbIssues").textContent = res.error?.message || "Unknown error";
    el("swapSuggestions").textContent = "—";
    el("rewritten").textContent = "—";
    el("changeLog").textContent = "—";
    return;
  }

  const dbIssues = res.dbIssues || [];
  el("dbIssues").textContent = dbIssues.length
    ? dbIssues.map((x,i)=>`${i+1}. [${x.category}] ${x.name}\n   Match: ${x.match}\n   Notes: ${x.notes || ""}`).join("\n\n")
    : "No matches found from your database.";

  const swaps = res.swapSuggestions || [];
  el("swapSuggestions").textContent = swaps.length
    ? swaps.map((s,i)=>`${i+1}. Trigger: ${s.trigger}\n   Swap to: ${s.swapTo}\n   Constraint: ${s.constraint || "(none)"}\n   Ratio/Note: ${s.ratioNote || ""}\n   Avoid if: ${s.avoidIf || ""}\n   Taste: ${s.tasteNote || ""}`).join("\n\n")
    : "No swap rules matched.";

  if(res.mode === "scan"){
    el("rewritten").textContent = "(Scan only mode — no rewrite requested.)";
    el("changeLog").textContent = "—";
    return;
  }

  const out = res.result;
  if(!out){
    el("rewritten").textContent = "No rewrite returned.";
    el("changeLog").textContent = "—";
    return;
  }

  const r = out.rewritten;
  el("rewritten").textContent =
    `${r.title}\nServings: ${r.servings}\n\nIngredients:\n` +
    (r.ingredients||[]).map(x=>`- ${x}`).join("\n") +
    `\n\nInstructions:\n` +
    (r.instructions||[]).map((x,i)=>`${i+1}) ${x}`).join("\n") +
    (r.notes?.length ? `\n\nNotes:\n${r.notes.map(x=>`- ${x}`).join("\n")}` : "");

  const cl = out.changeLog || [];
  el("changeLog").textContent = cl.length
    ? cl.map((c,i)=>`${i+1}. ${c.change}\n   Reason: ${c.reason}\n   Taste: ${c.tasteImpact}\n   Function: ${c.functionImpact}`).join("\n\n")
    : "—";
}

async function run(mode){
  const url = el("url").value.trim();
  if(!url) return renderUser({ok:false,error:{message:"Paste a recipe URL first."}});

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
    renderUser({ok:false,error:{message:String(err?.message||err)}});
  }finally{
    setBusy(false);
  }
}

// Admin UI helpers
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

// Wire up
el("go").addEventListener("click", ()=>run("rewrite"));
el("scanOnly").addEventListener("click", ()=>run("scan"));
el("toggleAdmin").addEventListener("click", openAdmin);
el("closeAdmin").addEventListener("click", closeAdmin);
el("addBad").addEventListener("click", addBad);
el("addSwap").addEventListener("click", addSwap);
el("adminListBad").addEventListener("click", ()=>adminList("bad"));
el("adminListSwaps").addEventListener("click", ()=>adminList("swaps"));
