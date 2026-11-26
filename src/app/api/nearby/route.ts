// 가까운 안전한 곳: 지금 위치 주변의 편의점, 지구대·파출소를 카카오 로컬 API로 실시간 조회합니다.
// - 카카오 이용 정책상 결과를 저장·캐시하지 않습니다(no-store). 매번 실시간으로 부릅니다.
// - 비상벨은 공공데이터(public/data/facilities.json)로 브라우저에서 계산하므로 여기서는 다루지 않습니다.

import { SERVICE_AREA } from "@/lib/facilities";

export interface NearbyPlace {
  kind: "store" | "police";
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** 카카오가 계산한 직선 거리(m) */
  distance: number;
  phone: string;
}

const NO_STORE = { "Cache-Control": "no-store" };

interface KakaoDoc {
  place_name: string;
  road_address_name: string;
  address_name: string;
  category_name: string;
  phone: string;
  x: string;
  y: string;
  distance: string;
}

async function kakao(path: string, params: Record<string, string>, key: string): Promise<KakaoDoc[]> {
  const url = new URL(`https://dapi.kakao.com${path}`);
  url.search = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  return ((await res.json()) as { documents?: KakaoDoc[] }).documents ?? [];
}

const toPlace = (kind: NearbyPlace["kind"]) => (d: KakaoDoc): NearbyPlace => ({
  kind,
  name: d.place_name,
  address: d.road_address_name || d.address_name,
  lat: Number(d.y),
  lng: Number(d.x),
  distance: Number(d.distance) || 0,
  phone: d.phone,
});

export async function GET(request: Request) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return Response.json({ error: "주변 검색이 아직 설정되지 않았어요." }, { status: 503, headers: NO_STORE });

  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  // 서비스 지역 근처 좌표만 받습니다 (다른 용도로 쓰이는 것을 막기 위해)
  const margin = 0.02;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < SERVICE_AREA.south - margin ||
    lat > SERVICE_AREA.north + margin ||
    lng < SERVICE_AREA.west - margin ||
    lng > SERVICE_AREA.east + margin
  ) {
    return Response.json({ error: "서비스 지역(전북대·전주교대 주변)에서만 쓸 수 있어요." }, { status: 400, headers: NO_STORE });
  }

  const at = { x: String(lng), y: String(lat), sort: "distance" };
  try {
    const [stores, jigudae, pachulso] = await Promise.all([
      // CS2 = 편의점 카테고리
      kakao("/v2/local/search/category.json", { ...at, category_group_code: "CS2", radius: "1000", size: "5" }, key),
      kakao("/v2/local/search/keyword.json", { ...at, query: "지구대", radius: "5000", size: "5" }, key),
      kakao("/v2/local/search/keyword.json", { ...at, query: "파출소", radius: "5000", size: "5" }, key),
    ]);

    // "지구대"가 들어간 가게 이름을 걸러내려고 경찰 분류만 남깁니다
    const seen = new Set<string>();
    const police = [...jigudae, ...pachulso]
      .filter((d) => d.category_name.includes("경찰"))
      .filter((d) => (seen.has(d.place_name) ? false : (seen.add(d.place_name), true)))
      .map(toPlace("police"))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);

    return Response.json({ stores: stores.map(toPlace("store")).slice(0, 3), police }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "주변 장소를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502, headers: NO_STORE });
  }
}
