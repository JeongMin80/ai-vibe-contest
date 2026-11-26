// 경로 공유 링크 점검
// 실행: node --experimental-strip-types --no-warnings scripts/test-share.mjs
import { encodeShare, parseShare } from "../src/lib/share.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};

const from = { lat: 35.848071234, lng: 127.132012345, label: "현재 위치" };
const to = { lat: 35.84276, lng: 127.128, label: "CU 전북대타운점, 1층" };

// 왕복: 만든 링크를 다시 읽으면 같은 값 (좌표는 소수 5자리 ≈ 1m)
const q = encodeShare({ from, to, level: "high" });
const back = parseShare("?" + q);
check(back.from && Math.abs(back.from.lat - from.lat) < 1e-5 && back.from.label === "현재 위치", "출발지 왕복");
check(back.to && back.to.label === "CU 전북대타운점, 1층", "이름에 쉼표가 있어도 그대로");
check(back.level === "high", "안전 우선 정도 왕복");

// 잘못된 입력은 무시
check(parseShare("?t=37.56,126.97,서울역").to === undefined, "서비스 지역 밖 좌표는 무시");
check(parseShare("?t=abc,def,x").to === undefined, "숫자가 아닌 좌표는 무시");
check(parseShare("?t=35.84,127.13").to?.label === "공유받은 위치", "이름이 없으면 기본 이름");
check(parseShare("?l=extreme").level === undefined, "모르는 안전 정도는 무시");
check(parseShare("?t=35.84,127.13," + "가".repeat(80)).to?.label.length === 40, "이름은 40자까지");
check(parseShare("?t=35.84,127.13,%3Cscript%3E%0A").to?.label === "<script>", "제어 문자 제거(화면에는 글자로만 표시됨)");
check(Object.values(parseShare("")).every((v) => v === undefined), "빈 주소는 아무것도 없음");

console.log(failures ? `\n공유 링크 점검 실패 ${failures}건` : "✅ 공유 링크 점검 통과");
process.exit(failures ? 1 : 0);
