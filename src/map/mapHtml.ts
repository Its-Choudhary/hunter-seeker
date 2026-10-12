// The map runs as a small Leaflet web page (inside a WebView on phones, an
// iframe on web). The app sends it a "scene" describing what to draw; the
// page sends back taps. Same code on iOS, Android and web, no API keys.

import type { LatLon, Zone } from '../engine/types';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

export type MapLayer = 'dark' | 'streets' | 'satellite';

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  kind?: 'avatar' | 'dot' | 'icon';
  text?: string; // avatar initial
  icon?: 'eye' | 'question' | 'sos' | 'pin';
  ring?: string; // role colour ring around avatars
  label?: string;
  size?: number;
  faded?: boolean;
  pulse?: boolean;
  path?: [t: number, lat: number, lon: number][]; // animated by the map using `clock`
}

export interface MapCircle {
  id: string;
  lat: number;
  lon: number;
  radius: number;
  color: string;
  dashed?: boolean;
  fill?: number;
}

export interface MapLine {
  id: string;
  points: LatLon[];
  color: string;
}

export interface MapScene {
  zone?: Zone | null;
  draft?: LatLon[]; // polygon being drawn
  me?: { lat: number; lon: number; acc: number } | null;
  markers?: MapMarker[];
  circles?: MapCircle[];
  lines?: MapLine[];
  fit?: number; // change this number to re-fit the view to the zone
  follow?: boolean; // keep my position centred
  start?: LatLon; // initial view if there's no zone yet
  layer?: MapLayer;
  interactive?: boolean; // false = no panning/zooming (tutorial)
  fitTo?: Zone; // fit the view to this instead of the drawn zone
  smooth?: boolean; // animate marker movement between scenes (tutorial)
  clock?: { t: number; wall: number; playing: boolean }; // playback clock for `path` markers
  grow?: { t0: number; dur: number }; // animate a circle zone growing in (tutorial)
}

const CSS = `
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#0c1117;-webkit-tap-highlight-color:transparent;font-family:-apple-system,system-ui,Roboto,sans-serif}
body.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.55)}
body.light #map{background:#e5e9ec}
.leaflet-container{background:#0c1117}
.zone{filter:drop-shadow(0 0 5px rgba(255,90,54,.75))}
.mk{position:relative;width:var(--s);height:var(--s)}
.mk .dot{position:absolute;inset:0;border-radius:50%;background:var(--c);border:2.5px solid #fff;box-sizing:border-box;box-shadow:0 1px 6px rgba(0,0,0,.6)}
.mk .av{position:absolute;inset:0;border-radius:50%;background:var(--c);display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 2.5px var(--r),0 0 0 4.5px rgba(7,9,13,.85),0 2px 8px rgba(0,0,0,.6);
  font:800 calc(var(--s) * .5)/1 -apple-system,system-ui,Roboto,sans-serif;color:#07090d}
.mk .ic{position:absolute;inset:0;border-radius:50%;background:var(--c);display:flex;align-items:center;justify-content:center;border:2px solid rgba(7,9,13,.85);box-shadow:0 2px 8px rgba(0,0,0,.6)}
.mk .ic svg{width:62%;height:62%;fill:#07090d}
.mk .lb{position:absolute;top:calc(var(--s) + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;font:600 11px -apple-system,system-ui,Roboto,sans-serif;color:#fff;background:rgba(7,9,13,.88);border:1px solid rgba(255,255,255,.14);padding:3px 7px;border-radius:8px}
.mk.faded{opacity:.42}
.mk.pulse::before{content:'';position:absolute;inset:-2px;border-radius:50%;border:3px solid var(--c);animation:pl 1.6s ease-out infinite}
.me{width:18px;height:18px;border-radius:50%;background:#3b8bff;border:3px solid #fff;box-sizing:border-box;box-shadow:0 0 0 6px rgba(59,139,255,.25),0 1px 6px rgba(0,0,0,.5)}
.vx{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #ff5a36;box-sizing:border-box}
@keyframes pl{from{transform:scale(1);opacity:.9}to{transform:scale(2.6);opacity:0}}
body.smooth .leaflet-marker-icon{transition:transform .15s linear}
body.smooth.leaflet-zooming .leaflet-marker-icon{transition:none}
.leaflet-control-attribution{font-size:9px;background:rgba(7,9,13,.6)!important;color:#8592a3!important}
.leaflet-control-attribution a{color:#8592a3!important}
`;

// Small icon paths (Material Design Icons, Apache 2.0).
const ICONS = {
  eye: 'M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z',
  question: 'M10,19H13V22H10V19M12,2C17.35,2.22 19.68,7.62 16.5,11.67C15.67,12.67 14.33,13.33 13.67,14.17C13,15 13,16 13,17H10C10,15.33 10,13.92 10.67,12.92C11.33,11.92 12.67,11.33 13.5,10.67C15.92,8.43 15.32,5.26 12,5A3,3 0 0,0 9,8H6A6,6 0 0,1 12,2Z',
  sos: 'M13,14H11V9H13M13,18H11V16H13M1,21H23L12,2L1,21Z',
  pin: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
};

const SCRIPT = `
(function(){
  var ICONS = ${JSON.stringify(ICONS)};
  function post(m){
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
    else if (window.parent !== window) window.parent.postMessage({__hsmap:true, data:m}, '*');
  }
  var map = L.map('map', {zoomControl:false, attributionControl:true, zoomSnap:0.25, zoomDelta:0.5}).setView([26.2934, 73.0243], 15);
  // Free tile sources, no API keys. Streets fall back to Esri if OSM refuses us.
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap'});
  var esriStreets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: '&copy; Esri'});
  var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Imagery &copy; Esri'});
  var streets = osm, base = null, baseKind = null, osmOk = 0, osmBad = 0;
  osm.on('tileload', function(){ osmOk++; });
  osm.on('tileerror', function(){
    osmBad++;
    if (osmBad >= 4 && osmOk === 0 && streets === osm) { streets = esriStreets; var k = baseKind; baseKind = null; setBase(k); }
  });
  function setBase(kind){
    if (kind === baseKind) return;
    baseKind = kind;
    var next = kind === 'satellite' ? sat : streets;
    document.body.classList.toggle('dark', kind === 'dark');
    document.body.classList.toggle('light', kind !== 'dark');
    if (base === next) return;
    if (base) map.removeLayer(base);
    base = next.addTo(map);
  }
  setBase('dark');
  var layer = L.layerGroup().addTo(map);
  var markerLayer = L.layerGroup().addTo(map);
  var meLayer = L.layerGroup().addTo(map);
  var mk = {}; // marker id -> {m, html, path}: moved in place so animations keep running
  var world = [[-85,-180],[-85,180],[85,180],[85,-180]];
  var clk = null, grow = null, zoneDraw = null;
  // Scripted playback (tutorial): markers with a path glide along it every frame.
  function curT(){ return !clk ? 0 : clk.playing ? clk.t + Math.max(0, Date.now() - clk.wall) / 1000 : clk.t; }
  function ease(k){ return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function along(p, t){
    if (t <= p[0][0]) return [p[0][1], p[0][2]];
    for (var i = 1; i < p.length; i++) if (t <= p[i][0]) {
      var k = ease((t - p[i-1][0]) / ((p[i][0] - p[i-1][0]) || 1));
      return [p[i-1][1] + (p[i][1] - p[i-1][1]) * k, p[i-1][2] + (p[i][2] - p[i-1][2]) * k];
    }
    var l = p[p.length - 1]; return [l[1], l[2]];
  }
  function frame(){
    if (clk) {
      var t = curT();
      for (var id in mk) if (mk[id].path) mk[id].m.setLatLng(along(mk[id].path, t));
      if (grow && zoneDraw && zoneDraw.zone.kind === 'circle') {
        var k = Math.max(0, Math.min(1, (t - grow.t0) / grow.dur)), kk = 1 - Math.pow(1 - k, 3);
        if (kk !== zoneDraw.k) {
          zoneDraw.k = kk;
          var z = zoneDraw.zone, r = ring({kind:'circle', center:z.center, radius:Math.max(1, z.radius * kk)});
          zoneDraw.mask.setLatLngs([world, r]);
          zoneDraw.line.setLatLngs(r);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  var lastFit = null, started = false, hasMe = false, locked = null;
  var userMoved = false, lastZone = null;
  map.on('click', function(e){ post({type:'press', lat:e.latlng.lat, lon:e.latlng.lng}); });
  map.on('dragstart', function(){ userMoved = true; post({type:'drag'}); });
  map.on('zoomstart', function(e){ if (e && e.originalEvent) userMoved = true; });
  // The view can resize after the first fit (layout settling): re-fit unless the player moved it.
  window.addEventListener('resize', function(){
    setTimeout(function(){
      map.invalidateSize();
      if (!userMoved && lastZone) map.fitBounds(zoneBounds(lastZone), {padding:[24,24]});
    }, 50);
  });
  function setInteractive(on){
    if (locked === !on) return;
    locked = !on;
    ['dragging','touchZoom','doubleClickZoom','scrollWheelZoom','boxZoom','keyboard'].forEach(function(h){
      if (map[h]) on ? map[h].enable() : map[h].disable();
    });
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var R = 6371000;
  function ring(z){
    if (z.kind !== 'circle') return z.points.map(function(p){ return [p.lat, p.lon]; });
    var out = [];
    for (var i = 0; i < 72; i++) {
      var a = i / 72 * 2 * Math.PI;
      var dn = Math.cos(a) * z.radius, de = Math.sin(a) * z.radius;
      out.push([z.center.lat + dn / R * 180 / Math.PI,
                z.center.lon + de / (R * Math.cos(z.center.lat * Math.PI / 180)) * 180 / Math.PI]);
    }
    return out;
  }
  function icon(m){
    var s = m.size || 16, kind = m.kind || 'dot', inner;
    if (kind === 'avatar') inner = '<span class="av" style="--r:' + (m.ring || '#fff') + '">' + esc(m.text || '?') + '</span>';
    else if (kind === 'icon') inner = '<span class="ic"><svg viewBox="0 0 24 24"><path d="' + (ICONS[m.icon] || ICONS.pin) + '"/></svg></span>';
    else inner = '<span class="dot"></span>';
    var html = '<div class="mk' + (m.faded ? ' faded' : '') + (m.pulse ? ' pulse' : '') +
      '" style="--c:' + m.color + ';--s:' + s + 'px">' + inner +
      (m.label ? '<span class="lb">' + esc(m.label) + '</span>' : '') + '</div>';
    return L.divIcon({html: html, className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2]});
  }
  function zoneBounds(z){ return L.latLngBounds(ring(z)); }

  window.__scene = function(sc){
    setBase(sc.layer || 'dark');
    setInteractive(sc.interactive !== false);
    layer.clearLayers();
    clk = sc.clock || null;
    grow = sc.grow || null;
    zoneDraw = null;
    if (sc.zone && (sc.zone.kind === 'circle' || sc.zone.points.length >= 3)) {
      var r = ring(sc.zone);
      zoneDraw = {
        zone: sc.zone, k: 1,
        mask: L.polygon([world, r], {stroke:false, fillColor:'#000', fillOpacity:0.45, interactive:false}).addTo(layer),
        line: L.polygon(r, {color:'#ff5a36', weight:3, fill:false, interactive:false, className:'zone'}).addTo(layer)
      };
      if (grow) zoneDraw.k = -1;
    }
    if (sc.draft && sc.draft.length) {
      var pts = sc.draft.map(function(p){ return [p.lat, p.lon]; });
      if (pts.length > 1) L.polyline(pts.concat(pts.length > 2 ? [pts[0]] : []), {color:'#ff5a36', weight:3, dashArray:'6 6', interactive:false}).addTo(layer);
      pts.forEach(function(p){ L.marker(p, {icon: L.divIcon({html:'<div class="vx"></div>', className:'', iconSize:[14,14], iconAnchor:[7,7]}), interactive:false}).addTo(layer); });
    }
    (sc.circles || []).forEach(function(c){
      L.circle([c.lat, c.lon], {radius:c.radius, color:c.color, weight:2, dashArray:c.dashed ? '6 6' : null,
        fillColor:c.color, fillOpacity:c.fill == null ? 0.15 : c.fill, interactive:false}).addTo(layer);
    });
    (sc.lines || []).forEach(function(l){
      L.polyline(l.points.map(function(p){ return [p.lat, p.lon]; }), {color:l.color, weight:2.5, opacity:0.7, dashArray:'2 7', lineCap:'round', interactive:false}).addTo(layer);
    });
    var seen = {};
    (sc.markers || []).forEach(function(m){
      var ic = icon(m), html = ic.options.html, cur = mk[m.id];
      var z = m.faded ? 0 : m.kind === 'avatar' ? 800 : 500;
      var ll = m.path && clk ? along(m.path, curT()) : [m.lat, m.lon];
      seen[m.id] = 1;
      if (cur) {
        cur.path = m.path || null;
        cur.m.setLatLng(ll);
        if (cur.html !== html) { cur.m.setIcon(ic); cur.html = html; }
        cur.m.setZIndexOffset(z);
      } else {
        mk[m.id] = {m: L.marker(ll, {icon: ic, interactive:false, zIndexOffset: z}).addTo(markerLayer), html: html, path: m.path || null};
      }
    });
    for (var id in mk) if (!seen[id]) { markerLayer.removeLayer(mk[id].m); delete mk[id]; }
    document.body.classList.toggle('smooth', !!sc.smooth);
    meLayer.clearLayers();
    if (sc.me) {
      L.circle([sc.me.lat, sc.me.lon], {radius: Math.max(3, sc.me.acc || 0), color:'#3b8bff', weight:1, fillOpacity:0.12, interactive:false}).addTo(meLayer);
      L.marker([sc.me.lat, sc.me.lon], {icon: L.divIcon({html:'<div class="me"></div>', className:'', iconSize:[18,18], iconAnchor:[9,9]}), interactive:false, zIndexOffset:1000}).addTo(meLayer);
    }
    lastZone = sc.fitTo || (sc.zone && (sc.zone.kind === 'circle' || sc.zone.points.length >= 3) ? sc.zone : null);
    if (sc.fit !== lastFit) {
      lastFit = sc.fit;
      userMoved = false;
      if (lastZone) map.fitBounds(zoneBounds(lastZone), {padding:[24,24]});
      else if (sc.me) map.setView([sc.me.lat, sc.me.lon], 16);
      else if (sc.start) map.setView([sc.start.lat, sc.start.lon], 15);
      started = true;
    } else if (!started && sc.start) { map.setView([sc.start.lat, sc.start.lon], 15); started = true; }
    if (sc.me && (sc.follow || !hasMe && !sc.zone)) map.panTo([sc.me.lat, sc.me.lon], {animate:true});
    hasMe = !!sc.me;
  };
  window.addEventListener('message', function(e){
    if (e.data && e.data.__hsscene) window.__scene(e.data.scene);
  });
  post({type:'ready'});
})();
`;

export function mapHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${LEAFLET_CSS}${CSS}</style></head><body class="dark"><div id="map"></div>
<script>${LEAFLET_JS}</script><script>${SCRIPT}</script></body></html>`;
}

export type MapEvent = { type: 'ready' } | { type: 'press'; lat: number; lon: number } | { type: 'drag' };
