// 전국보안등정보표준데이터(행정안전부, 공공데이터포털)에서 지자체 보안등을 받아 저장합니다.
// 실행: node scripts/fetch-lamps.mjs 전주시
// 결과: data/safety/lamp_<지역>.json  (키 값은 출력하지 않습니다)
//
// 참고
// - 전주시 자체 API(openapi.jeonju.go.kr)는 전주시 발급 15자리 키를 요구해서 공공데이터포털 키로는 쓸 수 없습니다.
//   같은 보안등 데이터가 행정안전부 표준데이터에 모여 있어 이쪽을 씁니다.
// - 기관명(insttNm)으로 거르면 서버 오류가 나서, 기관코드(insttCode)로 거릅니다.
//   기관코드는 CCTV 데이터의 OPN_ATMY_GRP_CD 값과 같습니다.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const AREAS = {
  전주시: "4641000",
};

const AREA = process.argv[2] ?? "전주시";
const CODE = AREAS[AREA];
if (!CODE) {
  console.error(`❌ 사용법: node scripts/fetch-lamps.mjs <${Object.keys(AREAS).join("|")}>`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const RAW = env.DATA_GO_KR_SERVICE_KEY;
if (!RAW) {
  console.error("❌ .env.local 의 DATA_GO_KR_SERVICE_KEY 가 비어 있습니다.");
  process.exit(1);
}
const KEY = RAW.includes("%") ? RAW : encodeURIComponent(RAW);
const BASE = "http://api.data.go.kr/openapi/tn_pubr_public_scrty_lmp_api";
const PER_PAGE = 1000;

async function getPage(page) {
  const url = `${BASE}?serviceKey=${KEY}&pageNo=${page}&numOfRows=${PER_PAGE}&type=json&insttCode=${CODE}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      const json = JSON.parse(await res.text());
      // 이 API는 {header, body} 형태 (다른 API의 {response: {...}} 와 다름)
      const root = json.response ?? json;
      if (root.header?.resultCode !== "00") throw new Error(`${root.header?.resultCode} ${root.header?.resultMsg}`);
      return { total: Number(root.body.totalCount), items: [].concat(root.body.items?.item ?? []) };
    } catch (e) {
      console.warn(`  페이지 ${page} 시도 ${attempt} 실패: ${e.message}`);
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

const t0 = Date.now();
console.log(`${AREA}(기관코드 ${CODE}) 보안등을 받는 중...`);
const first = await getPage(1);
const pages = Math.ceil(first.total / Math.max(first.items.length, 1));
console.log(`전체 ${first.total}건, 한 번에 ${first.items.length}건씩 ${pages}페이지`);
const all = [...first.items];
for (let p = 2; p <= pages; p++) {
  const { items } = await getPage(p);
  all.push(...items);
  process.stdout.write(`\r  ${p}/${pages} 페이지 (${all.length}건)`);
  await new Promise((r) => setTimeout(r, 500));
}
console.log();

const points = all
  .map((it) => ({
    lat: Number(it.latitude),
    lng: Number(it.longitude),
    count: Number(it.installationCo) || 1,
    addr: it.rdnmadr || it.lnmadr,
    updated: it.referenceDate,
  }))
  .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 33 && p.lat < 39 && p.lng > 124 && p.lng < 132);

mkdirSync(new URL("../data/safety/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../data/safety/lamp_${AREA}.json`, import.meta.url), JSON.stringify(points));
console.log(`받은 ${all.length}건 중 좌표 있는 ${points.length}건 저장 → data/safety/lamp_${AREA}.json (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
