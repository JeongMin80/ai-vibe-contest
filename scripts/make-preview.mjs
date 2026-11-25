// 수집한 안전시설 데이터를 대학 주변 반경 기준으로 세고, 지도 미리보기 HTML을 만듭니다.
// 실행: node scripts/make-preview.mjs
// 결과: preview/safety-map.html (브라우저로 열어서 확인)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const UNIVS = [
  { name: "전북대학교", lat: 35.8468, lng: 127.1294 },
  { name: "전주교육대학교", lat: 35.8068, lng: 127.1508 },
];
const RADIUS_M = 1500;

const LAYERS = [
  { id: "cctv", label: "CCTV", file: "data/safety/cctv_전주시.json", color: "#2563eb" },
  { id: "lamp", label: "보안등", file: "data/safety/lamp_전주시.json", color: "#f59e0b" },
  { id: "street", label: "가로등", file: "data/safety/streetlight_전주시.json", color: "#eab308" },
  { id: "bell", label: "안전비상벨", file: "data/safety/bell_전주시.json", color: "#dc2626" },
];

function distM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const root = new URL("../", import.meta.url);
const loaded = {};
for (const l of LAYERS) {
  const f = new URL(l.file, root);
  loaded[l.id] = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

console.log(`대학 반경 ${RADIUS_M}m 안의 안전시설 수`);
const near = {};
for (const u of UNIVS) {
  const row = [u.name];
  for (const l of LAYERS) {
    const pts = loaded[l.id];
    if (!pts) {
      row.push(`${l.label}: (데이터 없음)`);
      continue;
    }
    const inside = pts.filter((p) => distM(u, p) <= RADIUS_M);
    near[l.id] = (near[l.id] ?? []).concat(inside);
    row.push(`${l.label}: ${inside.length}곳`);
  }
  console.log(" - " + row.join(" | "));
}

// 중복 제거 후 지도에 넣을 점
const mapData = {};
for (const l of LAYERS) {
  const seen = new Set();
  mapData[l.id] = (near[l.id] ?? []).filter((p) => {
    const k = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((p) => [p.lat, p.lng, p.addr ?? "", p.purpose ?? ""]);
}

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>안전시설 분포 미리보기</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif}#map{height:100%}
.box{position:absolute;z-index:1000;top:10px;right:10px;background:#fff;padding:10px 12px;border-radius:8px;box-shadow:0 2px 8px #0003;font-size:13px;line-height:1.7}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}</style>
</head><body><div id="map"></div><div class="box" id="legend"><b>반경 ${RADIUS_M / 1000}km 안 안전시설</b><br></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const UNIVS=${JSON.stringify(UNIVS)};const LAYERS=${JSON.stringify(LAYERS.map(({ id, label, color }) => ({ id, label, color })))};
const DATA=${JSON.stringify(mapData)};
const map=L.map('map',{preferCanvas:true}).setView([UNIVS[0].lat,UNIVS[0].lng],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
for(const u of UNIVS){L.circle([u.lat,u.lng],{radius:${RADIUS_M},color:'#555',weight:1,fill:false,dashArray:'4'}).addTo(map);L.marker([u.lat,u.lng]).bindTooltip(u.name,{permanent:true}).addTo(map);}
const legend=document.getElementById('legend');const overlays={};
for(const l of LAYERS){const pts=DATA[l.id]||[];const g=L.layerGroup(pts.map(p=>L.circleMarker([p[0],p[1]],{radius:4,color:l.color,weight:1,fillOpacity:.8}).bindPopup(p[2]+(p[3]?' · '+p[3]:''))));g.addTo(map);overlays[l.label]=g;
legend.innerHTML+='<span class="dot" style="background:'+l.color+'"></span>'+l.label+': '+pts.length+'곳<br>';}
L.control.layers(null,overlays,{collapsed:false,position:'bottomright'}).addTo(map);
</script></body></html>`;

mkdirSync(new URL("preview/", root), { recursive: true });
writeFileSync(new URL("preview/safety-map.html", root), html);
console.log("\n지도 미리보기: preview/safety-map.html");
