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
