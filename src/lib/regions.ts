// 서비스 지역 (공모전 참여 대학 주변). 지역마다 데이터 파일이 따로 있습니다: public/data/<id>/
// 좌표 범위는 scripts/fetch-osm.mjs 의 도로망 범위와 같아야 합니다.

export type RegionId = "jeonju" | "gunsan" | "jeju";

export interface Area {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface Region {
  id: RegionId;
  name: string;
  /** 도로망을 받은 범위 (이 안에서만 경로 계산) */
  area: Area;
  center: [number, number];
  /** 캠퍼스 바로가기 (OpenStreetMap 캠퍼스 경계의 중심점) */
  places: { name: string; lat: number; lng: number }[];
}

export const REGIONS: Region[] = [
  {
    id: "jeonju",
    name: "전주",
    area: { south: 35.795, west: 127.105, north: 35.865, east: 127.17 },
    center: [35.84663, 127.13391],
    places: [
      { name: "전북대학교", lat: 35.84663, lng: 127.13391 },
      { name: "전주교육대학교", lat: 35.80843, lng: 127.15467 },
    ],
  },
  {
    id: "gunsan",
    name: "군산",
    area: { south: 35.93, west: 126.64, north: 35.985, east: 126.72 },
    center: [35.94693, 126.68034],
    places: [{ name: "국립군산대학교", lat: 35.94693, lng: 126.68034 }],
  },
  {
    id: "jeju",
    name: "제주",
    area: { south: 33.445, west: 126.5, north: 33.52, east: 126.585 },
    // 캠퍼스는 지역 남쪽 끝이라, 원룸촌(아라동·이도동)이 같이 보이도록 조금 북쪽을 중심으로
    center: [33.465, 126.56],
    places: [{ name: "제주대학교", lat: 33.4547, lng: 126.56034 }],
  },
];

export const DEFAULT_REGION = REGIONS[0];

export const regionById = (id: RegionId) => REGIONS.find((r) => r.id === id) ?? DEFAULT_REGION;

export function inArea(a: Area, lat: number, lng: number, margin = 0) {
  return lat >= a.south - margin && lat <= a.north + margin && lng >= a.west - margin && lng <= a.east + margin;
}

/** 이 좌표가 속한 지역 (없으면 null) */
export function regionOf(lat: number, lng: number, margin = 0): Region | null {
  return REGIONS.find((r) => inArea(r.area, lat, lng, margin)) ?? null;
}
