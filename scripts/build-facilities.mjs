// 수집한 안전시설 원본(data/safety/*.json)을 웹에서 쓰기 좋은 작은 파일로 가공합니다.
// 실행: node scripts/build-facilities.mjs
// 결과: public/data/facilities.json
//   { updated, sources, cctv: [[lat, lng, cams]], bell: [[lat, lng, "설치장소"]], lamp: [[lat, lng]], street: [[lat, lng]] }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const AREA = "전주시";
const r6 = (n) => Math.round(n * 1e6) / 1e6; // 소수점 6자리 ≈ 10cm 정밀도

function load(name) {
  const f = new URL(`data/safety/${name}_${AREA}.json`, root);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
}

// 같은 좌표에 중복으로 등록된 시설은 하나로 합칩니다 (CCTV는 카메라 수를 더함)
function dedupe(points, merge) {
  const map = new Map();
  for (const p of points) {
    const k = `${r6(p.lat)},${r6(p.lng)}`;
    if (map.has(k)) merge?.(map.get(k), p);
    else map.set(k, { ...p });
  }
  return [...map.values()];
}

const cctvRaw = load("cctv");
const bellRaw = load("bell");
const lampRaw = load("lamp");
const streetRaw = load("street");

const cctv = dedupe(cctvRaw, (a, b) => (a.cams += b.cams)).map((p) => [r6(p.lat), r6(p.lng), p.cams]);
const bell = dedupe(bellRaw).map((p) => [r6(p.lat), r6(p.lng), p.place ?? ""]);
const lamp = dedupe(lampRaw).map((p) => [r6(p.lat), r6(p.lng)]);
const street = dedupe(streetRaw).map((p) => [r6(p.lat), r6(p.lng)]);

const latest = (arr) => arr.map((p) => p.updated).filter(Boolean).sort().at(-1) ?? null;

const out = {
  area: AREA,
  builtAt: new Date().toISOString().slice(0, 10),
  updated: { cctv: latest(cctvRaw), bell: latest(bellRaw), lamp: latest(lampRaw), street: latest(streetRaw) },
  sources: {
    cctv: "행정안전부_CCTV정보 조회서비스 (공공데이터포털)",
    bell: "행정안전부_안전비상벨위치정보 조회서비스 (공공데이터포털)",
    lamp: "전북특별자치도 전주시_보안등 정보 서비스 (공공데이터포털)",
    street: "전북특별자치도 전주시_가로등 정보 서비스 (공공데이터포털)",
  },
  cctv,
  bell,
  lamp,
  street,
};

mkdirSync(new URL("public/data/", root), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(new URL("public/data/facilities.json", root), json);
console.log(
  `CCTV ${cctv.length}곳(원본 ${cctvRaw.length}) · 비상벨 ${bell.length} · 보안등 ${lamp.length} · 가로등 ${street.length}`
);
console.log(`public/data/facilities.json ${(json.length / 1024).toFixed(0)}KB`);
