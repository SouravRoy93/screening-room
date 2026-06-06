// Aesthetic photo selector for Places (Option B — storable sources).
// Runs in GitHub Actions. For each place in places.json it:
//   1. gathers candidate images from Unsplash (multi) + Wikimedia (canonical)
//   2. heuristic pre-filters (landscape, min resolution)
//   3. asks a vision model to pick the most aesthetic "hero" shot
//   4. writes the winning URL + attribution back into places.json
//
// Env (set as GitHub Actions secrets):
//   UNSPLASH_ACCESS_KEY   - free Unsplash API key (primary candidate source)
//   AI_PROVIDER           - "anthropic" or "openai"
//   ANTHROPIC_API_KEY     - if AI_PROVIDER=anthropic
//   OPENAI_API_KEY        - if AI_PROVIDER=openai
// Wikimedia needs no key.
import { readFileSync, writeFileSync } from "node:fs";

const UNSPLASH = process.env.UNSPLASH_ACCESS_KEY;
const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

async function unsplash(query){
  if(!UNSPLASH) return [];
  try{
    const u = "https://api.unsplash.com/search/photos?per_page=8&orientation=landscape&content_filter=high&query=" + encodeURIComponent(query);
    const r = await fetch(u, { headers: { Authorization: "Client-ID " + UNSPLASH } });
    if(!r.ok) return [];
    const d = await r.json();
    return (d.results || []).map(p => ({
      url: p.urls.regular, w: p.width, h: p.height,
      attr: (p.user && p.user.name ? p.user.name : "Unsplash") + " / Unsplash",
      link: (p.links && p.links.html) || "https://unsplash.com",
      dl: (p.links && p.links.download_location) || null, src: "unsplash"
    }));
  }catch(e){ return []; }
}
async function wikimedia(title){
  try{
    const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original%7Cthumbnail&pithumbsize=1400&redirects=1&origin=*&titles=" + encodeURIComponent(title);
    const r = await fetch(u); if(!r.ok) return null;
    const d = await r.json();
    const pages = (d.query && d.query.pages) || {}; const pg = pages[Object.keys(pages)[0]];
    const o = pg && (pg.original || pg.thumbnail); if(!o || !o.source) return null;
    return { url: o.source, w: o.width || 1200, h: o.height || 800, attr: "via Wikimedia Commons", link: "https://en.wikipedia.org/wiki/" + encodeURIComponent(title), src: "wikimedia" };
  }catch(e){ return null; }
}
async function visionPick(name, list){
  const prompt = 'You are an art director choosing ONE hero image for a luxury city guide entry: "' + name + '" in New York. Pick the single most aesthetically pleasing, magazine-quality photograph. Prefer striking composition, beautiful natural light (golden hour a plus), and a clear, recognisable view of the place. Reject maps, logos, screenshots, menus, heavy crowds or selfies, and blurry or very dark images. Reply with ONLY the 0-based index number of the best image.';
  try{
    if(PROVIDER === "anthropic"){
      const key = process.env.ANTHROPIC_API_KEY; if(!key) return 0;
      const content = [{ type:"text", text:prompt }].concat(list.map(c => ({ type:"image", source:{ type:"url", url:c.url } })));
      const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{ "x-api-key":key, "anthropic-version":"2023-06-01", "content-type":"application/json" }, body: JSON.stringify({ model:"claude-3-5-haiku-latest", max_tokens:8, messages:[{ role:"user", content }] }) });
      const d = await r.json(); const t = (d.content && d.content[0] && d.content[0].text) || "0"; const m = t.match(/\d+/); return m ? Math.min(+m[0], list.length-1) : 0;
    } else {
      const key = process.env.OPENAI_API_KEY; if(!key) return 0;
      const content = [{ type:"text", text:prompt }].concat(list.map(c => ({ type:"image_url", image_url:{ url:c.url } })));
      const r = await fetch("https://api.openai.com/v1/chat/completions", { method:"POST", headers:{ Authorization:"Bearer "+key, "Content-Type":"application/json" }, body: JSON.stringify({ model:"gpt-4o-mini", max_tokens:8, messages:[{ role:"user", content }] }) });
      const d = await r.json(); const t = (d.choices && d.choices[0] && d.choices[0].message.content) || "0"; const m = t.match(/\d+/); return m ? Math.min(+m[0], list.length-1) : 0;
    }
  }catch(e){ return 0; }
}

const places = JSON.parse(readFileSync("places.json", "utf8"));
let updated = 0;
for(const p of places){
  const base = p.name.split("—")[0].split("&")[0].trim();
  let cands = await unsplash(base + " New York");
  cands = cands.filter(c => c.w >= c.h && c.w >= 800);          // heuristic pre-filter: landscape, decent res
  cands.sort((a,b) => (b.w*b.h) - (a.w*a.h));
  if(cands.length < 2){ const w = await wikimedia(base); if(w) cands.push(w); }
  if(!cands.length){ console.warn("no candidates:", p.name); continue; }
  let idx = cands.length > 1 ? await visionPick(p.name, cands.slice(0,8)) : 0;
  const best = cands[idx] || cands[0];
  p.img = best.url; p.imgAttr = best.attr; p.imgLink = best.link;
  if(best.src === "unsplash" && best.dl){ try{ await fetch(best.dl + "?client_id=" + UNSPLASH); }catch(e){} }  // Unsplash attribution ping
  updated++;
  console.log(p.name, "→", best.src, "#" + idx);
}
writeFileSync("places.json", JSON.stringify(places, null, 1));
console.log("Updated " + updated + " / " + places.length + " places.");
