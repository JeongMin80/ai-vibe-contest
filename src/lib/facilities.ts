// public/data/facilities.json 의 형태 (scripts/build-facilities.mjs 가 만듭니다)

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
  { id: "street", label: "가로등", short: "가로등", color: "var(--street)" },
  { id: "bell", label: "안전비상벨", short: "비상벨", color: "var(--bell)" },
];

export async function loadFacilities(): Promise<FacilityData> {
  const res = await fetch("/data/facilities.json");
  if (!res.ok) throw new Error(`안전시설 데이터를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

/** 지도에서 바로 고를 수 있는 주요 장소 (OpenStreetMap 캠퍼스 경계의 중심점) */
export const PLACES = [
  { name: "전북대학교", lat: 35.84663, lng: 127.13391 },
  { name: "전주교육대학교", lat: 35.80843, lng: 127.15467 },
] as const;

/** 서비스 지역 (도로망을 받은 범위) */
export const SERVICE_AREA = { south: 35.795, west: 127.105, north: 35.865, east: 127.17 };
