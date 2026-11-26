// 내 장소(집, 자주 가는 곳)를 이 기기(브라우저)에만 저장합니다. 로그인이 필요 없습니다.
// - 좌표는 카카오 검색 좌표가 아니라 OSM 길 위의 점(경로 계산용 교차점)을 저장합니다.
//   (카카오 로컬 API 결과는 저장하면 안 되는 정책을 지키기 위해서)
// - 브라우저 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않게 모든 접근을 try/catch 합니다.

export interface SavedPlace {
  id: string;
  name: string;
  home: boolean;
  lat: number;
  lng: number;
}

export const STORAGE_KEY = "hwanhangil.places.v1";
export const MAX_PLACES = 10;
/** 이 거리(m) 안이면 같은 장소로 봅니다 */
export const SAME_PLACE_M = 30;

// ---------- 순수 함수 (테스트 가능) ----------

function isPlace(v: unknown): v is SavedPlace {
  const p = v as SavedPlace;
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.home === "boolean" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

export function parsePlaces(raw: string | null): SavedPlace[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isPlace).slice(0, MAX_PLACES) : [];
  } catch {
    return [];
  }
}

function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function findNear(list: SavedPlace[], lat: number, lng: number): SavedPlace | undefined {
  return list.find((p) => distM(p.lat, p.lng, lat, lng) <= SAME_PLACE_M);
}

/** 장소 추가 또는 갱신. 집은 하나만 둡니다. 같은 곳이면 이름·집 여부만 바꿉니다. */
export function upsertPlace(list: SavedPlace[], input: Omit<SavedPlace, "id">, id = Date.now().toString(36)): SavedPlace[] {
  const name = input.name.trim().slice(0, 20) || (input.home ? "집" : "내 장소");
  let next = input.home ? list.map((p) => (p.home ? { ...p, home: false } : p)) : [...list];
  const same = findNear(next, input.lat, input.lng);
  if (same) {
    next = next.map((p) => (p.id === same.id ? { ...p, name, home: input.home } : p));
  } else {
    next = [{ ...input, name, id }, ...next];
  }
  // 집을 맨 앞에
  next.sort((a, b) => Number(b.home) - Number(a.home));
  return next.slice(0, MAX_PLACES);
}

export function removePlace(list: SavedPlace[], id: string): SavedPlace[] {
  return list.filter((p) => p.id !== id);
}

// ---------- 브라우저 저장소 연결 (useSyncExternalStore 용) ----------

const EMPTY: SavedPlace[] = [];
let cache: SavedPlace[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedPlace[] {
  try {
    return parsePlaces(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

export function subscribePlaces(cb: () => void) {
  listeners.add(cb);
  // 다른 탭에서 바꾼 것도 반영
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function getPlacesSnapshot(): SavedPlace[] {
  if (cache === null) cache = read();
  return cache;
}

export function getPlacesServerSnapshot(): SavedPlace[] {
  return EMPTY;
}

/** 저장하고 화면에 알림. 저장소를 못 쓰면 false (이번 접속 동안만 유지) */
export function writePlaces(list: SavedPlace[]): boolean {
  cache = list;
  let ok = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    ok = false;
  }
  listeners.forEach((l) => l());
  return ok;
}
