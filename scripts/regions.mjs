// 지역 설정 (데이터 수집·가공 스크립트가 함께 씀)
// slug: public/data/<slug>/ 폴더 이름
// box : 안전시설을 남길 범위 (도로망 범위보다 조금 넓게)
export const REGIONS = {
  전주시: { slug: "jeonju", box: { south: 35.79, west: 127.1, north: 35.87, east: 127.175 } },
  군산시: { slug: "gunsan", box: { south: 35.925, west: 126.635, north: 35.99, east: 126.725 } },
  제주시: { slug: "jeju", box: { south: 33.44, west: 126.495, north: 33.525, east: 126.59 } },
};

export function regionFromArgs() {
  const area = process.argv[2] ?? "전주시";
  const r = REGIONS[area];
  if (!r) {
    console.error(`사용법: node ${process.argv[1]} <${Object.keys(REGIONS).join("|")}>`);
    process.exit(1);
  }
  return { area, ...r };
}
