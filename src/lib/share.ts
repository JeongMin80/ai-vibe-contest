// 경로 공유 링크: 출발·도착(좌표 + 이름)과 안전 우선 정도를 주소창 매개변수로 담습니다.
// 예) https://hwanhangil.vercel.app/?f=35.84807,127.13201,현재 위치&t=35.84276,127.128,CU 전북대타운점&l=mid
// - 받은 링크는 믿을 수 없는 입력이므로 좌표 범위·이름 길이를 검사합니다.

import { regionOf } from "./regions.ts";

export type ShareLevel = "low" | "mid" | "high";

export interface SharePoint {
  lat: number;
  lng: number;
  label: string;
}

export interface ShareData {
  from?: SharePoint;
  to?: SharePoint;
  level?: ShareLevel;
}

const MARGIN = 0.02;
const MAX_LABEL = 40;
const LEVELS: ShareLevel[] = ["low", "mid", "high"];

function encodePoint(p: SharePoint) {
  // 이름에 쉼표가 있어도 괜찮도록 이름은 마지막에 둡니다
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.label.slice(0, MAX_LABEL)}`;
}

function parsePoint(v: string | null): SharePoint | undefined {
  if (!v) return undefined;
  const [a, b, ...rest] = v.split(",");
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  // 서비스 지역(전주·군산·제주 대학가) 중 한 곳 근처여야 함
  if (!regionOf(lat, lng, MARGIN)) return undefined;
  // 이름에 들어 있는 제어 문자는 지우고 길이를 제한
  const label = rest.join(",").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_LABEL) || "공유받은 위치";
  return { lat, lng, label };
}

export function encodeShare(d: ShareData): string {
  const p = new URLSearchParams();
  if (d.from) p.set("f", encodePoint(d.from));
  if (d.to) p.set("t", encodePoint(d.to));
  if (d.level) p.set("l", d.level);
  return p.toString();
}

export function parseShare(search: string): ShareData {
  const p = new URLSearchParams(search);
  const level = p.get("l") as ShareLevel | null;
  return {
    from: parsePoint(p.get("f")),
    to: parsePoint(p.get("t")),
    level: level && LEVELS.includes(level) ? level : undefined,
  };
}

// ---- 안심 귀가 알림: 가족·친구에게 보내는 출발·도착 문장 ----

const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

/** 받침에 맞춰 "로/으로" 고르기 (한글이 아니면 "(으)로") */
export function toward(word: string): string {
  const w = word.trim();
  const code = w.charCodeAt(w.length - 1) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return `${w}(으)로`;
  const jong = code % 28;
  return jong === 0 || jong === 8 ? `${w}로` : `${w}으로`;
}

/** 출발 알림: "지금 ○○로 걸어가고 있어요. 약 N분 뒤(HH:MM쯤) 도착 예정" */
export function departText(dest: string, minutes: number, now: Date = new Date()): string {
  const m = Math.max(1, Math.round(minutes));
  const eta = new Date(now.getTime() + m * 60_000);
  return `[환한길] 지금 ${toward(dest)} 걸어가고 있어요. 약 ${m}분 뒤(${hhmm(eta)}쯤) 도착할 예정이에요.`;
}

/** 도착 알림 */
export function arriveText(dest: string, now: Date = new Date()): string {
  return `[환한길] ${dest}에 안전하게 도착했어요. (${hhmm(now)})`;
}

/** 늦어짐 알림: 지금 위치 링크를 열면 받는 사람 휴대폰에서 그 위치까지 안심 경로가 보임 */
export function lateText(dest: string): string {
  return `[환한길] 예상보다 늦어지고 있어요. ${toward(dest)} 가는 중이에요. 아래 링크가 지금 제 위치예요.`;
}
