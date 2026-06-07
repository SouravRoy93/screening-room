// Place photos — WIKIMEDIA-DIRECT (accurate first). For each place it uses the
// verified Wikipedia article photo (skipping logos/SVGs). Only if a place has no
// Wikipedia photo does it fall back to Unsplash (+ optional vision pick).
//
// Optional env (only used for the Unsplash fallback):
//   UNSPLASH_ACCESS_KEY, AI_PROVIDER ("anthropic"/"openai"), ANTHROPIC_API_KEY / OPENAI_API_KEY
// With Wikimedia-direct, the 20 NYC landmarks need NO keys and cost $0.
import { readFileSync, writeFileSync } from "node:fs";

const UNSPLASH = process.env.UNSPLASH_ACCESS_KEY;
const PROVIDER = (process.env.AI_PROVIDER || "").toLowerCase();

// Exact Wikipedia article titles → the correct, verified photo for every place.
const WIKI = {
  1:"Central Park", 2:"Metropolitan Museum of Art", 3:"High Line", 4:"Brooklyn Bridge",
  5:"The Cloisters", 6:"One Vanderbilt", 7:"Frick Collection", 8:"Little Island (park)",
  9:"Grand Central Terminal", 10:"30 Rockefeller Plaza", 11:"New York Public Library Main Branch",
  12:"Whitney Museum of American Art", 13:"Brooklyn Heights Promenade", 14:"Brooklyn Botanic Garden",
  15:"World Trade Center station (PATH)", 16:"Bryant Park", 17:"Roosevelt Island Tramway",
  18:"Morgan Library & Museum", 19:"The Battery (Manhattan)", 20:"Conservatory Garden"
};

async function wikimedia(title){
  try{
    const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original%7Cthumbnail&pithumbsize=1400&redirects=1&origin=*&titles=" + encodeURIComponent(title);
    const r = await fetch(u); if(!r.ok) return null;
    const d = await r.json();
    const pages = (d.query && d.query.pages) || {}; const pg = pages[Object.keys(pages)[0]];
    const o = pg && (pg.original || pg.thumbnail); if(!o || !o.source) return null;
    if(/\.svg(\?|$)/i.test(o.source)) return null;                 // skip logos / vector graphics
    const url = (o.width && o.width > 2600 && pg.thumbnail) ? pg.thumbnail.source : o.source; // avoid huge files
    return { url, attr:"via Wikimedia Commons", link:"https://en.wikipedia.org/wiki/" + encodeURIComponent(title), src:"wikimedia" };
  }catch(e){ return null; }
}
async function unsplash(query){
  if(!UNSPLASH) return [];
  try{
    const u = "https://api.unsplash.com/search/photos?per_page=6&orientation=landscape&content_filter=high&query=" + encodeURIComponent(query);
    const r = await fetch(u, { headers:{ Authorization:"Client-ID " + UNSPLASH } });
    if(!r.ok) return [];
    const d = await r.json();
    return (d.results || []).filter(p => p.width >= p.height && p.width >= 800).map(p => ({
      url:p.urls.regular, thumb:(p.urls.small || p.urls.thumb),
      attr:(p.user && p.user.name ? p.user.name : "Unsplash") + " / Unsplash",
      link:(p.links && p.links.html) || "https://unsplash.com",
      dl:(p.links && p.links.download_location) || null, src:"unsplash" }));
  }catch(e){ return []; }
}
async function visionPick(name, list){
  if(!PROVIDER) return 0;
  const prompt = 'Pick the most beautiful, accurate hero photo of "' + name + '" in New York. Avoid maps, logos, menus, and crowd selfies. Reply with ONLY the index number.';
  try{
    if(PROVIDER === "anthropic"){
      const key = process.env.ANTHROPIC_API_KEY; if(!key) return 0;
      const content = [{ type:"text", text:prompt }].concat(list.map(c => ({ type:"image", source:{ type:"url", url:c.thumb } })));
      const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{ "x-api-key":key, "anthropic-version":"2023-06-01", "content-type":"application/json" }, body: JSON.stringify({ model:"claude-3-5-haiku-latest", max_tokens:8, messages:[{ role:"user", content }] }) });
      const d = await r.json(); const t = (d.content && d.content[0] && d.content[0].text) || "0"; const m = t.match(/\d+/); return m ? Math.min(+m[0], list.length-1) : 0;
    } else {
      const key = process.env.OPENAI_API_KEY; if(!key) return 0;
      const content = [{ type:"text", text:prompt }].concat(list.map(c => ({ type:"image_url", image_url:{ url:c.thumb } })));
      const r = await fetch("https://api.openai.com/v1/chat/completions", { method:"POST", headers:{ Authorization:"Bearer "+key, "Content-Type":"application/json" }, body: JSON.stringify({ model:"gpt-4o-mini", max_tokens:8, messages:[{ role:"user", content }] }) });
      const d = await r.json(); const t = (d.choices && d.choices[0] && d.choices[0].message.content) || "0"; const m = t.match(/\d+/); return m ? Math.min(+m[0], list.length-1) : 0;
    }
  }catch(e){ return 0; }
}

const places = JSON.parse(readFileSync("places.json", "utf8"));
let updated = 0;
for(const p of places){
  const base = p.name.split("—")[0].split("&")[0].trim();
  let best = await wikimedia(WIKI[p.id] || base);          // accurate landmark photo first
  if(!best){                                                // only if Wikipedia has no photo
    const uns = await unsplash(base + " New York");
    if(uns.length){ const i = uns.length > 1 ? await visionPick(p.name, uns) : 0; best = uns[i]; }
  }
  if(!best){ console.warn("no photo:", p.name); continue; }
  p.img = best.url; p.imgAttr = best.attr; p.imgLink = best.link;
  if(best.src === "unsplash" && best.dl){ try{ await fetch(best.dl + "?client_id=" + UNSPLASH); }catch(e){} }
  updated++;
  console.log(p.name, "→", best.src);
}
writeFileSync("places.json", JSON.stringify(places, null, 1));
console.log("Updated " + updated + " / " + places.length + " places.");
