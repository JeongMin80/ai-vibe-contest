// 장소 검색 API: 카카오 로컬 API를 서버에서 대신 호출합니다.
// - 카카오 REST 키(KAKAO_REST_API_KEY)는 서버 환경변수에만 두고 브라우저에 보내지 않습니다.
// - 카카오 이용 정책상 검색 결과를 저장하면 안 되므로 서버·CDN 캐시를 모두 끕니다(no-store).
// - 결과는 서비스 지역(전북대·전주교대 주변) 안의 장소만 돌려줍니다.

import { SERVICE_AREA } from "@/lib/facilities";

export interface SearchResult {
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

const NO_STORE = { "Cache-Control": "no-store" };
const RECT = `${SERVICE_AREA.west},${SERVICE_AREA.south},${SERVICE_AREA.east},${SERVICE_AREA.north}`;

function inArea(lat: number, lng: number) {
  return lat >= SERVICE_AREA.south && lat <= SERVICE_AREA.north && lng >= SERVICE_AREA.west && lng <= SERVICE_AREA.east;
}

interface KakaoPlace {
  place_name: string;
  road_address_name: string;
  address_name: string;
  category_group_name: string;
  category_name: string;
  x: string;
  y: string;
}
interface KakaoAddress {
  address_name: string;
  road_address: { address_name: string; building_name: string } | null;
  x: string;
  y: string;
}

async function kakao<T>(path: string, params: Record<string, string>, key: string): Promise<T[]> {
  const url = new URL(`https://dapi.kakao.com${path}`);
  url.search = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const json = (await res.json()) as { documents?: T[] };
  return json.documents ?? [];
}

export async function GET(request: Request) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return Response.json({ error: "장소 검색이 아직 설정되지 않았어요." }, { status: 503, headers: NO_STORE });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 50) {
    return Response.json({ error: "검색어는 1~50자로 입력해 주세요." }, { status: 400, headers: NO_STORE });
  }

  try {
    // 1) 장소 이름 검색 (서비스 지역 사각형 안에서만)
    const places = await kakao<KakaoPlace>("/v2/local/search/keyword.json", { query: q, rect: RECT, size: "10" }, key);
    let results: SearchResult[] = places.map((p) => ({
      name: p.place_name,
      address: p.road_address_name || p.address_name,
      category: p.category_group_name || p.category_name.split(" > ").at(-1) || "",
      lat: Number(p.y),
      lng: Number(p.x),
    }));

    // 2) 장소가 없으면 주소로 다시 검색 (예: "백제대로 567")
    if (results.length === 0) {
      const addrs = await kakao<KakaoAddress>("/v2/local/search/address.json", { query: q, size: "10" }, key);
      results = addrs.map((a) => ({
        name: a.road_address?.building_name || a.road_address?.address_name || a.address_name,
        address: a.road_address?.address_name || a.address_name,
        category: "주소",
        lat: Number(a.y),
        lng: Number(a.x),
      }));
    }

    results = results.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && inArea(r.lat, r.lng));
    return Response.json({ results }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502, headers: NO_STORE });
  }
}
