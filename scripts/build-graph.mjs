// 도로망(OSM)과 안전시설 데이터로 "길마다 안전 점수가 매겨진 그래프"를 만듭니다.
// 실행: node scripts/build-graph.mjs
// 입력: data/raw/osm-walk_전주시.json, data/raw/osm-campus_전주시.json, data/safety/*.json
// 결과: public/data/graph.json
//
// 그래프 형식 (용량을 줄이려고 배열로 저장)
//   nodes: [lat, lng, lat, lng, ...]                  교차점 좌표 (평탄화)
//   edges: [[u, v, len, score, cctv, flags, hw, geom], ...]
//     u, v   : 양 끝 교차점 번호
//     len    : 길이(m)
//     score  : 안전 점수 0~100
//     cctv   : 50m 안 CCTV 수
//     flags  : 1=캠퍼스 안(공공데이터 없음), 2=100m 안 비상벨, 4=30m 안 보안등 있음,
//              8=큰길·보도라서 가로등이 있다고 추정(가로등 실제 위치 데이터가 없어서)
//     hw     : 길 종류 번호 (HW_TYPES 참고)
//     geom   : 중간 좌표 [lat, lng, ...] (양 끝 교차점 제외)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const AREA = "전주시";
const root = new URL("../", import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

// ---------- 설정: 안전 점수 ----------
const CCTV_RADIUS = 50; // m
const LIGHT_RADIUS = 30; // m
const BELL_RADIUS = 100; // m
const SAMPLE_STEP = 20; // m 간격으로 길 위의 점을 찍어 검사
const CAMPUS_SCORE = 60; // 캠퍼스 안은 데이터가 없으므로 중립 점수

// 길 종류별 기본 안전도 (큰길은 밝고 사람이 많음, 산길·계단은 어둡고 한적함)
const HW_TYPES = [
  "primary", "secondary", "tertiary", "unclassified", "residential", "living_street",
  "service", "pedestrian", "footway", "path", "steps", "track", "cycleway", "corridor",
];
const ROAD_BASE = {
  primary: 0.95, secondary: 0.9, tertiary: 0.8, unclassified: 0.55, residential: 0.55,
  living_street: 0.55, service: 0.4, pedestrian: 0.6, footway: 0.45, path: 0.15,
  steps: 0.25, track: 0.1, cycleway: 0.45, corridor: 0.5,
};
const hwKey = (hw) => hw.replace(/_link$/, "");

// 가로등 추정: 차도가 있는 큰길과 그 옆 보도는 가로등이 설치되어 밝다고 봅니다.
// (사용자 의견 2026-11-26. 전주시 가로등 위치 API는 전주시 자체 키가 필요해 아직 못 받음)
const LIT_ROADS = new Set(["primary", "secondary", "tertiary"]);
const STREETLIGHT_ESTIMATE = 0.9; // 큰길의 추정 조명 비율

// ---------- 거리 계산 ----------
const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
function dist(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- 공간 색인 (약 100m 격자) ----------
const CELL = 0.001;
function makeIndex(points) {
  const grid = new Map();
  points.forEach((p, i) => {
    const k = `${Math.floor(p.lat / CELL)},${Math.floor(p.lng / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return {
    points,
    near(lat, lng, radius) {
      const r = Math.ceil(radius / 100) + 0;
      const ci = Math.floor(lat / CELL);
      const cj = Math.floor(lng / CELL);
      const out = [];
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          const list = grid.get(`${ci + di},${cj + dj}`);
          if (!list) continue;
          for (const idx of list) {
            const p = points[idx];
            if (dist(lat, lng, p.lat, p.lng) <= radius) out.push(idx);
          }
        }
      return out;
    },
  };
}

function loadSafety(name) {
  const f = new URL(`data/safety/${name}_${AREA}.json`, root);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
}
const cctvIdx = makeIndex(loadSafety("cctv"));
const bellIdx = makeIndex(loadSafety("bell"));
const lights = [...loadSafety("lamp"), ...loadSafety("street")];
const lightIdx = makeIndex(lights);
const HAS_LIGHT = lights.length > 0;

// ---------- 캠퍼스 경계 ----------
const campusRaw = readJson(`data/raw/osm-campus_${AREA}.json`);
const campusRings = [];
for (const el of campusRaw.elements) {
  if (el.type === "way" && el.geometry) campusRings.push(el.geometry.map((g) => [g.lat, g.lon]));
  if (el.type === "relation")
    for (const m of el.members ?? [])
      if (m.role === "outer" && m.geometry) campusRings.push(m.geometry.map((g) => [g.lat, g.lon]));
}
function inCampus(lat, lng) {
  for (const ring of campusRings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// ---------- 도로망 → 그래프 ----------
const osm = readJson(`data/raw/osm-walk_${AREA}.json`);
const coord = new Map();
for (const el of osm.elements) if (el.type === "node") coord.set(el.id, [el.lat, el.lon]);
const ways = osm.elements.filter((e) => e.type === "way" && e.nodes?.length >= 2);

// 여러 길이 만나는 점, 길의 끝점 = 교차점
const useCount = new Map();
for (const w of ways)
  w.nodes.forEach((n, i) => {
    const inc = i === 0 || i === w.nodes.length - 1 ? 2 : 1;
    useCount.set(n, (useCount.get(n) ?? 0) + inc);
  });
const isJunction = (n) => (useCount.get(n) ?? 0) >= 2;

const nodeIndex = new Map(); // osm id -> 그래프 번호
const nodeList = [];
const idxOf = (osmId) => {
  if (!nodeIndex.has(osmId)) {
    nodeIndex.set(osmId, nodeList.length);
    nodeList.push(coord.get(osmId));
  }
  return nodeIndex.get(osmId);
};

let rawEdges = [];
for (const w of ways) {
  const hw = hwKey(w.tags.highway);
  if (!(hw in ROAD_BASE)) continue;
  let start = 0;
  for (let i = 1; i < w.nodes.length; i++) {
    if (!isJunction(w.nodes[i]) && i !== w.nodes.length - 1) continue;
    const seg = w.nodes.slice(start, i + 1);
    if (seg.every((n) => coord.has(n)) && seg[0] !== seg.at(-1)) {
      rawEdges.push({
        a: seg[0],
        b: seg.at(-1),
        pts: seg.map((n) => coord.get(n)),
        hw,
        lit: w.tags.lit,
        sidewalk: w.tags.footway === "sidewalk",
      });
    }
    start = i;
  }
}

// 가장 큰 연결 덩어리만 남김 (고립된 길 제거)
const adj = new Map();
for (const e of rawEdges) {
  if (!adj.has(e.a)) adj.set(e.a, []);
  if (!adj.has(e.b)) adj.set(e.b, []);
  adj.get(e.a).push(e.b);
  adj.get(e.b).push(e.a);
}
const comp = new Map();
let best = { id: -1, size: 0 };
let cid = 0;
for (const start of adj.keys()) {
  if (comp.has(start)) continue;
  const stack = [start];
  comp.set(start, cid);
  let size = 0;
  while (stack.length) {
    const n = stack.pop();
    size++;
    for (const m of adj.get(n)) {
      if (comp.has(m)) continue;
      comp.set(m, cid);
      stack.push(m);
    }
  }
  if (size > best.size) best = { id: cid, size };
  cid++;
}
const before = rawEdges.length;
rawEdges = rawEdges.filter((e) => comp.get(e.a) === best.id);

// ---------- 안전 점수 ----------
function samplePoints(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [aLat, aLng] = pts[i - 1];
    const [bLat, bLng] = pts[i];
    const d = dist(aLat, aLng, bLat, bLng);
    const steps = Math.floor(d / SAMPLE_STEP);
    for (let s = 1; s <= steps; s++) {
      const t = (s * SAMPLE_STEP) / d;
      out.push([aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t]);
    }
    out.push(pts[i]);
  }
  return out;
}

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const edges = [];
const stats = { campus: 0, withCctv: 0, withBell: 0, scoreSum: 0, lenSum: 0, lamp: 0, street: 0 };
for (const e of rawEdges) {
  let len = 0;
  for (let i = 1; i < e.pts.length; i++) len += dist(...e.pts[i - 1], ...e.pts[i]);
  const samples = samplePoints(e.pts);
  const cctvSet = new Set();
  let cctvHit = 0;
  let lightHit = 0;
  let bell = false;
  for (const [lat, lng] of samples) {
    const near = cctvIdx.near(lat, lng, CCTV_RADIUS);
    if (near.length) cctvHit++;
    near.forEach((i) => cctvSet.add(i));
    if (HAS_LIGHT && lightIdx.near(lat, lng, LIGHT_RADIUS).length) lightHit++;
    if (!bell && bellIdx.near(lat, lng, BELL_RADIUS).length) bell = true;
  }
  const cctvCover = cctvHit / samples.length;
  const lampCover = lightHit / samples.length; // 실제 보안등 데이터
  const streetEstimated = LIT_ROADS.has(e.hw) || e.sidewalk || e.lit === "yes";
  let lightCover = lampCover;
  if (streetEstimated) lightCover = Math.max(lightCover, e.lit === "yes" ? 1 : STREETLIGHT_ESTIMATE);
  if (e.lit === "no") lightCover = Math.min(lightCover, 0.2);
  const roadC = Math.max(0, Math.min(1, ROAD_BASE[e.hw]));

  // 조명(보안등 + 큰길 가로등 추정)이 들어가면서 길 종류 비중을 줄였습니다.
  let score = 0.4 * cctvCover + 0.35 * lightCover + 0.2 * roadC + 0.05 * (bell ? 1 : 0);
  score = Math.round(score * 100);

  const mid = e.pts[Math.floor(e.pts.length / 2)];
  const campus = inCampus(mid[0], mid[1]);
  if (campus) score = Math.max(score, CAMPUS_SCORE);

  const flags = (campus ? 1 : 0) | (bell ? 2 : 0) | (lampCover > 0 ? 4 : 0) | (streetEstimated ? 8 : 0);
  stats.lamp += lampCover > 0 ? 1 : 0;
  stats.street += streetEstimated ? 1 : 0;
  const geom = e.pts.slice(1, -1).flatMap(([la, ln]) => [r5(la), r5(ln)]);
  edges.push([idxOf(e.a), idxOf(e.b), Math.round(len), score, cctvSet.size, flags, HW_TYPES.indexOf(e.hw), geom]);

  stats.campus += campus ? 1 : 0;
  stats.withCctv += cctvSet.size ? 1 : 0;
  stats.withBell += bell ? 1 : 0;
  stats.scoreSum += score * len;
  stats.lenSum += len;
}

const out = {
  area: AREA,
  builtAt: new Date().toISOString().slice(0, 10),
  hasLight: HAS_LIGHT,
  hwTypes: HW_TYPES,
  nodes: nodeList.flatMap(([la, ln]) => [r5(la), r5(ln)]),
  edges,
};
mkdirSync(new URL("public/data/", root), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(new URL("public/data/graph.json", root), json);

// 점수 분포
const buckets = [0, 0, 0, 0, 0];
for (const e of edges) buckets[Math.min(4, Math.floor(e[3] / 20))] += e[2];
const km = (m) => (m / 1000).toFixed(1);
console.log(`교차점 ${nodeList.length}개, 길 구간 ${edges.length}개 (고립 구간 ${before - rawEdges.length}개 제외)`);
console.log(`총 길이 ${km(stats.lenSum)}km, 거리 가중 평균 점수 ${(stats.scoreSum / stats.lenSum).toFixed(1)}`);
console.log(`CCTV 50m 안 구간 ${stats.withCctv}, 비상벨 100m 안 구간 ${stats.withBell}, 캠퍼스 구간 ${stats.campus}`);
console.log(`점수 분포(길이 km): 0-19 ${km(buckets[0])} | 20-39 ${km(buckets[1])} | 40-59 ${km(buckets[2])} | 60-79 ${km(buckets[3])} | 80-100 ${km(buckets[4])}`);
console.log(`조명: 보안등 ${lights.length}개 (30m 안 보안등 있는 구간 ${stats.lamp}) · 큰길 가로등 추정 구간 ${stats.street}`);
console.log(`public/data/graph.json ${(json.length / 1024).toFixed(0)}KB`);
