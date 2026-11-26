// OpenStreetMap에서 걸을 수 있는 길과 대학 캠퍼스 경계를 받아 저장합니다.
// 실행: node scripts/fetch-osm.mjs
// 결과: data/raw/osm-walk_전주시.json, data/raw/osm-campus_전주시.json
// 데이터 © OpenStreetMap 기여자 (ODbL)

import { mkdirSync, writeFileSync } from "node:fs";

// 지역별 범위: 남, 서, 북, 동 (각 대학 주변 원룸촌을 넉넉히 덮음)
const REGION_BOXES = {
  전주시: [35.795, 127.105, 35.865, 127.17], // 전북대·전주교대
  군산시: [35.93, 126.64, 35.985, 126.72], // 국립군산대(미룡동)·나운동
  제주시: [33.445, 126.5, 33.52, 126.585], // 제주대(아라동)·이도동
};
const AREA = process.argv[2] ?? "전주시";
if (!REGION_BOXES[AREA]) {
  console.error(`사용법: node scripts/fetch-osm.mjs <${Object.keys(REGION_BOXES).join("|")}>`);
  process.exit(1);
}
const BBOX = REGION_BOXES[AREA].join(",");

const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// 보행 가능한 길 종류 (자동차 전용도로 제외)
const WALKABLE =
  "primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|path|steps|track|cycleway|corridor";

const WALK_QUERY = `[out:json][timeout:180];
way["highway"~"^(${WALKABLE})$"]["foot"!~"^(no|private)$"]["access"!~"^(private|no)$"](${BBOX})->.w;
.w out body;
node(w.w);
out skel qt;`;

const CAMPUS_QUERY = `[out:json][timeout:120];
(
  way["amenity"~"^(university|college)$"](${BBOX});
  relation["amenity"~"^(university|college)$"](${BBOX});
);
out geom;`;

async function overpass(query, label) {
  for (let round = 1; round <= 3; round++) {
    for (const server of SERVERS) {
      try {
        const t0 = Date.now();
        const res = await fetch(server, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "hwanhangil-data-builder/0.1" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(200_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        console.log(`  ${label}: ${server} 에서 ${json.elements.length}개 요소 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
        return json;
      } catch (e) {
        console.warn(`  ${label}: ${server} 실패 (${e.message})`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000 * round));
  }
  throw new Error(`${label}: 모든 서버에서 실패`);
}

mkdirSync(new URL("../data/raw/", import.meta.url), { recursive: true });

console.log("도로망 받는 중...");
const walk = await overpass(WALK_QUERY, "도로망");
writeFileSync(new URL(`../data/raw/osm-walk_${AREA}.json`, import.meta.url), JSON.stringify(walk));

console.log("캠퍼스 경계 받는 중...");
const campus = await overpass(CAMPUS_QUERY, "캠퍼스");
writeFileSync(new URL(`../data/raw/osm-campus_${AREA}.json`, import.meta.url), JSON.stringify(campus));

const ways = walk.elements.filter((e) => e.type === "way").length;
const nodes = walk.elements.filter((e) => e.type === "node").length;
const names = campus.elements.map((e) => e.tags?.name).filter(Boolean);
console.log(`\n길 ${ways}개, 점 ${nodes}개 / 캠퍼스: ${names.join(", ")}`);
