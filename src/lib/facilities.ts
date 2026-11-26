// public/data/<지역>/facilities.json 의 형태 (scripts/build-facilities.mjs 가 만듭니다)
import type { RegionId } from "./regions.ts";

export type LatLngTuple = [number, number];

export interface FacilityData {
  area: string;
  builtAt: string;
  updated: Partial<Record<LayerId, string | null>>;
  sources: Record<LayerId, string>;
  /** [위도, 경도, 카메라 수] */
  cctv: [number, number, number][];
  /** [위도, 경도, 설치 장소] */
  bell: [number, number, string][];
  /** [위도, 경도] */
  lamp: LatLngTuple[];
  /** [위도, 경도] */
  street: LatLngTuple[];
}

export type LayerId = "cctv" | "lamp" | "street" | "bell";

export const LAYERS: { id: LayerId; label: string; color: string; short: string }[] = [
  { id: "cctv", label: "CCTV", short: "CCTV", color: "var(--cctv)" },
  { id: "lamp", label: "보안등", short: "보안등", color: "var(--lamp)" },
  { id: "street", label: "가로등(큰길 추정)", short: "큰길 조명", color: "var(--street)" },
  { id: "bell", label: "안전비상벨", short: "비상벨", color: "var(--bell)" },
];

export async function loadFacilities(region: RegionId): Promise<FacilityData> {
  const res = await fetch(`/data/${region}/facilities.json`);
  if (!res.ok) throw new Error(`안전시설 데이터를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

