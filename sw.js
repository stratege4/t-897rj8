// Service Worker Thailand 2027. Bei jeder Veröffentlichung APP hochzählen, sonst bekommen installierte Geräte nichts Neues.
// APP: Seite, Symbole, Leaflet, Schriften. TILES: Kartenkacheln, begrenzt auf MAX_TILES (älteste fliegen zuerst raus).
// Fahrzeiten liegen nicht hier, sondern im localStorage der App.
const APP = "thailand-app-v3", TILES = "thailand-tiles-v1", MAX_TILES = 4000, NET_TIMEOUT = 4000;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"];
// einzeln cachen: fällt eine Datei aus, landen die übrigen trotzdem im Cache
self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![APP,TILES].includes(k)).map(k => caches.delete(k))))); self.clients.claim(); });
let trimming = false, puts = 0;
async function trimTiles(c){
  if(trimming) return; trimming = true;
  try{ const keys = await c.keys(); for(let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]); } finally { trimming = false; }
}
// Netz mit Zeitlimit: bei schwachem Empfang nicht ewig warten, sondern den gespeicherten Stand zeigen
const timed = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then(r => { clearTimeout(t); res(r); }, err => { clearTimeout(t); rej(err); }); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if(e.request.method !== "GET") return;
  if(url.hostname.endsWith("arcgisonline.com")){ // Kacheln: erst Cache, dann Netz
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request); if(hit) return hit;
      try{ const res = await fetch(e.request); if(res.ok || res.type === "opaque"){ await c.put(e.request, res.clone()); if(++puts % 50 === 0) trimTiles(c); } return res; }
      catch(err){ return Response.error(); }
    }));
    return;
  }
  if(url.origin === location.origin && (e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/"))){ // Seite: erst Netz, dann Cache
    const net = fetch(e.request).then(res => { if(res.ok){ const c = res.clone(); caches.open(APP).then(ca => ca.put("./index.html", c)); } return res; });
    e.respondWith(timed(net, NET_TIMEOUT).catch(() => caches.match("./index.html").then(h => h || net)));
    return;
  }
  if(url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){ // Rest: Cache sofort, im Hintergrund auffrischen
    e.respondWith(caches.open(APP).then(async c => { const hit = await c.match(e.request); const net = fetch(e.request).then(res => { if(res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit || Response.error()); return hit || net; }));
  }
});
