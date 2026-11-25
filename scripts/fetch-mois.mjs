// 행정안전부 위치 데이터(CCTV, 안전비상벨)를 지역 좌표 범위로 받아 저장합니다.
// 실행: node scripts/fetch-mois.mjs <cctv|bell> <전주시|군산시|제주시>
//   예) node scripts/fetch-mois.mjs cctv 전주시
// 결과: data/safety/<cctv|bell>_<지역>.json  (키 값은 출력하지 않습니다)
//
// 참고: 주소 LIKE 검색은 누락이 많고, 관리기관명은 부서·공단·경찰 등으로 제각각이라
//       위도·경도 범위(cond[WGS84_LAT::GTE] 등)로 거릅니다.
//       이 API는 한 번에 최대 100건까지만 돌려주고, 동시에 많이 요청하면 거절합니다.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const SERVICES = {
  cctv: {
    url: "https://apis.data.go.kr/1741000/cctv_info/info",
    map: (it) => ({
      cams: Number(it.CAM_CNTOM) || 1,
      purpose: it.INSTL_PRPS_SE_NM,
    }),
  },
  bell: {
    url: "https://apis.data.go.kr/1741000/emergency_call_box_info/info",
    map: (it) => ({
      place: it.INSTL_PSTN,
      purpose: it.INSTL_PRPS,
      police: it.POLC_LINK_EN === "Y",
      lastCheck: it.LAST_CHCK_YMD,
      checkOk: it.LAST_CHCK_RSLT_SE,
    }),
  },
};

// [최소 위도, 최대 위도, 최소 경도, 최대 경도]
const AREAS = {
  전주시: [35.78, 35.89, 127.05, 127.2],
  군산시: [35.93, 36.0, 126.62, 126.76],
  제주시: [33.44, 33.53, 126.45, 126.6],
};

const [svcName = "cctv", AREA = "전주시"] = process.argv.slice(2);
const SVC = SERVICES[svcName];
const BOX = AREAS[AREA];
if (!SVC || !BOX) {
  console.error(`❌ 사용법: node scripts/fetch-mois.mjs <${Object.keys(SERVICES).join("|")}> <${Object.keys(AREAS).join("|")}>`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const RAW_KEY = env.DATA_GO_KR_SERVICE_KEY;
if (!RAW_KEY) {
  console.error("❌ .env.local 의 DATA_GO_KR_SERVICE_KEY 가 비어 있습니다.");
  process.exit(1);
}
const KEY = RAW_KEY.includes("%") ? RAW_KEY : encodeURIComponent(RAW_KEY);
const PER_PAGE = 100;

async function getPage(page) {
  const filter = Object.entries({
    "cond[WGS84_LAT::GTE]": BOX[0],
    "cond[WGS84_LAT::LTE]": BOX[1],
    "cond[WGS84_LOT::GTE]": BOX[2],
    "cond[WGS84_LOT::LTE]": BOX[3],
  })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${SVC.url}?serviceKey=${KEY}&pageNo=${page}&numOfRows=${PER_PAGE}&returnType=json&${filter}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      const json = JSON.parse(await res.text());
      const header = json.response?.header;
      if (!header) throw new Error("응답 형식이 예상과 다릅니다");
      if (header.resultCode !== "0" && header.resultCode !== "00")
        throw new Error(`API 오류 ${header.resultCode}: ${header.resultMsg}`);
      const body = json.response.body;
      return { total: Number(body.totalCount), items: body.items?.item ?? [] };
    } catch (e) {
      console.warn(`  페이지 ${page} 시도 ${attempt} 실패: ${e.message}`);
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

console.log(`[${svcName}] ${AREA} 범위 데이터를 받는 중...`);
const t0 = Date.now();
const first = await getPage(1);
console.log(`전체 ${first.total}건`);
const all = [...first.items];
const pages = Math.ceil(first.total / Math.max(first.items.length, 1));
for (let p = 2; p <= pages; p++) {
  const { items } = await getPage(p);
  all.push(...items);
  await new Promise((r) => setTimeout(r, 300)); // 서버 부담을 줄이려고 잠깐 쉼
}

const points = all
  .map((it) => ({
    lat: Number(it.WGS84_LAT),
    lng: Number(it.WGS84_LOT),
    addr: it.LCTN_ROAD_NM_ADDR || it.LCTN_LOTNO_ADDR,
    inst: it.MNG_INST_NM,
    updated: it.DAT_CRTR_YMD,
    ...SVC.map(it),
  }))
  .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 30 && p.lng > 120);

mkdirSync(new URL("../data/safety/", import.meta.url), { recursive: true });
const out = `data/safety/${svcName}_${AREA}.json`;
writeFileSync(new URL(`../${out}`, import.meta.url), JSON.stringify(points));

const byPurpose = {};
for (const p of points) byPurpose[p.purpose] = (byPurpose[p.purpose] ?? 0) + 1;
console.log(`받은 건수 ${all.length} / 좌표 있는 건수 ${points.length}`);
console.log("설치목적:", JSON.stringify(byPurpose));
console.log(`저장: ${out} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
