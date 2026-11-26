// 음성·진동 안내 점검: 언제 무엇을 말하는지 (되풀이하지 않는지)
// 실행: node --experimental-strip-types --no-warnings scripts/test-voice.mjs
import { DARK_WARN_M, pickCue, startText } from "../src/lib/voice.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};

const base = { arrived: false, offRoute: false, along: 0, dark: null, destination: "집" };

// 1) 아무 일 없으면 말하지 않음
let r = pickCue(base, new Set());
check(r.cue === null, "평소에는 조용함");

// 2) 어두운 구간: 멀면 조용, 가까워지면 한 번만
r = pickCue({ ...base, along: 100, dark: { startIn: 150, length: 80 } }, r.spoken);
check(r.cue === null, "어두운 구간이 멀면(150m) 조용함");
r = pickCue({ ...base, along: 200, dark: { startIn: 50, length: 80 } }, r.spoken);
check(r.cue && r.cue.key.startsWith("dark") && r.cue.text.includes("약 50미터 앞") && r.cue.text.includes("80미터"), "60m 안으로 오면 알림");
const firstDark = r.cue?.key;
r = pickCue({ ...base, along: 230, dark: { startIn: 20, length: 80 } }, r.spoken);
check(r.cue === null, "같은 구간은 다시 말하지 않음");
r = pickCue({ ...base, along: 252, dark: { startIn: 0, length: 78 } }, r.spoken);
check(r.cue === null, "구간 안을 걷는 동안에도 되풀이 없음");
r = pickCue({ ...base, along: 600, dark: { startIn: 40, length: 120 } }, r.spoken);
check(r.cue && r.cue.key !== firstDark, "다음 어두운 구간은 새로 알림");

// 3) 경로 이탈: 벗어날 때 한 번, 돌아왔다 다시 벗어나면 또 한 번
r = pickCue({ ...base, offRoute: true }, r.spoken);
check(r.cue?.key === "off" && r.cue.vibrate.length >= 3, "이탈 알림 + 진동");
r = pickCue({ ...base, offRoute: true }, r.spoken);
check(r.cue === null, "이탈 중에는 되풀이 없음");
r = pickCue({ ...base, along: 700 }, r.spoken);
r = pickCue({ ...base, offRoute: true }, r.spoken);
check(r.cue?.key === "off", "다시 벗어나면 다시 알림");

// 4) 도착: 한 번, 다른 알림보다 먼저
r = pickCue({ ...base, arrived: true, offRoute: true, dark: { startIn: 0, length: 50 } }, r.spoken);
check(r.cue?.key === "arrived" && r.cue.text.includes("집에 도착"), "도착이 가장 먼저");
r = pickCue({ ...base, arrived: true }, r.spoken);
check(r.cue === null, "도착은 한 번만");

// 5) 시작 문장
check(startText("전주교대", 1500) === "전주교대까지 걸어서 약 20분, 안심 경로로 안내를 시작합니다.", "시작 문장");
check(DARK_WARN_M === 60, "어두운 구간 알림 거리 60m");

if (failures) {
  console.log(`❌ 음성 안내 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("✅ 음성 안내 점검 통과");
