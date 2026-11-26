// 내 장소 저장 로직 점검
// 실행: node --experimental-strip-types --no-warnings scripts/test-places.mjs
import { parsePlaces, upsertPlace, removePlace, findNear, MAX_PLACES } from "../src/lib/savedPlaces.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};

const A = { lat: 35.8385, lng: 127.1265 };
const B = { lat: 35.8389, lng: 127.1405 };

// 저장소 값이 깨져 있어도 빈 목록
check(parsePlaces(null).length === 0, "null → 빈 목록");
check(parsePlaces("{망가짐").length === 0, "깨진 JSON → 빈 목록");
check(parsePlaces('[{"id":1}]').length === 0, "형식이 틀린 항목은 버림");

// 추가와 집
let list = upsertPlace([], { ...A, name: "", home: true }, "a");
check(list.length === 1 && list[0].name === "집" && list[0].home, "이름 없이 집 저장 → '집'");
list = upsertPlace(list, { ...B, name: "도서관", home: false }, "b");
check(list.length === 2 && list[0].home, "집이 맨 앞");

// 집은 하나만
list = upsertPlace(list, { ...B, name: "새 집", home: true }, "c");
check(list.filter((p) => p.home).length === 1, "집은 하나만");
check(list.length === 2, "같은 장소(30m 안)는 새로 추가하지 않고 갱신");
check(list[0].name === "새 집" && list[0].lat === B.lat, "갱신된 장소가 집이 됨");

// 가까운 장소 찾기
check(findNear(list, A.lat + 0.0001, A.lng)?.id === "a", "11m 떨어진 곳은 같은 장소");
check(findNear(list, A.lat + 0.001, A.lng) === undefined, "110m 떨어진 곳은 다른 장소");

// 이름 길이 제한, 개수 제한
const long = upsertPlace([], { ...A, name: "가".repeat(40), home: false }, "x");
check(long[0].name.length === 20, "이름은 20자까지");
let many = [];
for (let i = 0; i < 15; i++) many = upsertPlace(many, { lat: 35.8 + i * 0.01, lng: 127.1, name: `곳${i}`, home: false }, `id${i}`);
check(many.length === MAX_PLACES, `최대 ${MAX_PLACES}개`);

// 삭제
check(removePlace(list, "a").length === 1, "삭제");

console.log(failures ? `\n내 장소 점검 실패 ${failures}건` : "✅ 내 장소 점검 통과");
process.exit(failures ? 1 : 0);
