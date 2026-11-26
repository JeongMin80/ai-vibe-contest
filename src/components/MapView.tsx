"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FacilityData, LayerId } from "@/lib/facilities";
import { DEFAULT_REGION, type Area, type Region } from "@/lib/regions";
import { FLAG_STREETLIGHT, scoreColor, type Graph, type Route } from "@/lib/routing";
import { REPORT_KINDS, type Report } from "@/lib/reports";

export interface Point {
  lat: number;
  lng: number;
  label: string;
  /** 길에 붙이기 전 원래 고른 좌표 (건물이 길에서 떨어져 있어도 도착을 알아채려고) */
  orig?: { lat: number; lng: number };
}

interface Props {
  data: FacilityData | null;
  graph: Graph | null;
  /** 지금 지역: 지도 중심·이동 범위·캠퍼스 이름표 */
  region: Region;
  visible: Record<LayerId, boolean>;
  from: Point | null;
  to: Point | null;
  safe: Route | null;
  short: Route | null;
  /** 지도를 누르면 호출 (경로 모드일 때만) */
  onPick?: (lat: number, lng: number) => void;
  picking: boolean;
  /** 길 안내 중 내 위치 */
  me?: { lat: number; lng: number; acc: number } | null;
  /** 내 위치를 따라 지도를 움직일지 */
  follow?: boolean;
  /** 사용자가 지도를 직접 끌었을 때 (따라가기 해제용) */
  onUserMove?: () => void;
  /** 최근 시민 제보 */
  reports?: Report[];
  /** 제보하려고 고른 위치 */
  mark?: { lat: number; lng: number } | null;
}

function ago(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600e3);
  return h < 1 ? "방금" : h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 지도를 끌어서 갈 수 있는 범위: 지역보다 조금 넓게 */
const boundsOf = (a: Area) => L.latLngBounds([a.south - 0.03, a.west - 0.04], [a.north + 0.03, a.east + 0.04]);

/** 보안등은 이 확대 수준부터 보여줌 */
const LAMP_MIN_ZOOM = 15;

const COLORS: Record<LayerId, string> = {
  cctv: "#4ea8ff",
  lamp: "#ffb020",
  street: "#ffe27a",
  bell: "#ff5d6c",
};

function pinIcon(letter: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #0b1020;box-shadow:0 2px 8px #0008;display:grid;place-items:center"><span style="transform:rotate(45deg);font:700 13px system-ui;color:#0b1020">${letter}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

export default function MapView({ data, graph, region, visible, from, to, safe, short, onPick, picking, me, follow, onUserMove, reports, mark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupsRef = useRef<Partial<Record<LayerId, L.LayerGroup>>>({});
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const [zoom, setZoom] = useState(15);
  const onPickRef = useRef(onPick);
  const onUserMoveRef = useRef(onUserMove);
  const meLayerRef = useRef<L.LayerGroup | null>(null);
  const reportLayerRef = useRef<L.LayerGroup | null>(null);
  const regionLayerRef = useRef<L.LayerGroup | null>(null);
  /** 지금 지도가 맞춰져 있는 지역 */
  const shownRegionRef = useRef(DEFAULT_REGION.id);
  useEffect(() => {
    onPickRef.current = onPick;
    onUserMoveRef.current = onUserMove;
  }, [onPick, onUserMove]);

  // 지도 생성 (한 번만)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: DEFAULT_REGION.center,
      zoom: 15,
      minZoom: 13,
      maxZoom: 19,
      preferCanvas: true,
      zoomControl: false,
      maxBounds: boundsOf(DEFAULT_REGION.area),
    });
    shownRegionRef.current = DEFAULT_REGION.id;
    L.control.zoom({ position: "topright" }).addTo(map);
    // 키가 필요 없는 OpenStreetMap 기본 타일을 쓰고, CSS 필터(.dark-tiles)로 어둡게 바꿉니다.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "dark-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map);

    // 지역 표시(바깥 어둡게·캠퍼스 이름표)는 지역이 바뀔 때마다 다시 그림 (아래 효과)
    regionLayerRef.current = L.layerGroup().addTo(map);

    // 경로와 내 위치는 안전시설 점들보다 위에 그리도록 전용 층을 만듭니다
    map.createPane("routePane").style.zIndex = "450";
    map.createPane("mePane").style.zIndex = "460";
    routeLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
    // 사용자가 직접 끌면 "따라가기"를 멈춤 (코드로 움직인 것은 dragstart가 생기지 않음)
    map.on("dragstart", () => onUserMoveRef.current?.());
    map.on("zoomend", () => setZoom(map.getZoom()));
    meLayerRef.current = L.layerGroup().addTo(map);
    // 지도와 함께 만들어야 지도가 다시 만들어져도(개발 모드의 StrictMode 등) 새 지도에 붙습니다
    reportLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      groupsRef.current = {};
    };
  }, []);

  // 지역이 바뀌면: 그 지역으로 이동, 이동 범위 제한, 바깥은 살짝 어둡게, 캠퍼스 이름표
  useEffect(() => {
    const map = mapRef.current;
    const layer = regionLayerRef.current;
    if (!map || !layer) return;
    const a = region.area;
    layer.clearLayers();
    const world: L.LatLngTuple[] = [
      [-89, -179],
      [-89, 179],
      [89, 179],
      [89, -179],
    ];
    const box: L.LatLngTuple[] = [
      [a.south, a.west],
      [a.south, a.east],
      [a.north, a.east],
      [a.north, a.west],
    ];
    L.polygon([world, box], { stroke: false, fillColor: "#000", fillOpacity: 0.45, interactive: false }).addTo(layer);
    for (const p of region.places) {
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#ffd166", weight: 2, fillOpacity: 1, fillColor: "#ffd166" })
        .bindTooltip(p.name, { permanent: true, direction: "top", offset: [0, -6], className: "place-label" })
        .addTo(layer);
    }
    // 지역을 실제로 바꿨을 때만 지도를 옮김 (처음에는 지도를 만들 때 이미 그 지역에 맞춰 둠)
    if (shownRegionRef.current === region.id) return;
    shownRegionRef.current = region.id;
    // 범위를 먼저 풀고 이동한 뒤 새 범위를 걸어야 다른 지역으로 넘어갈 수 있음
    map.setMaxBounds(undefined as unknown as L.LatLngBounds);
    map.setView(region.center, 15, { animate: false });
    map.setMaxBounds(boundsOf(a));
  }, [region]);

  // 지도 선택 중일 때 커서 모양
  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (el) el.style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  // 안전시설 레이어 만들기
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const renderer = L.canvas({ padding: 0.5 });
    const groups: Partial<Record<LayerId, L.LayerGroup>> = {};

    groups.cctv = L.layerGroup(
      data.cctv.map(([lat, lng, cams]) =>
        L.circleMarker([lat, lng], {
          renderer,
          radius: 3 + Math.min(cams, 6) * 0.4,
          color: COLORS.cctv,
          weight: 1,
          fillOpacity: 0.85,
          bubblingMouseEvents: true,
        }).bindTooltip(`CCTV · 카메라 ${cams}대`)
      )
    );
    groups.lamp = L.layerGroup(
      data.lamp.map(([lat, lng]) =>
        L.circleMarker([lat, lng], { renderer, radius: 2, color: COLORS.lamp, weight: 0, fillOpacity: 0.7 })
      )
    );
    groups.bell = L.layerGroup(
      data.bell.map(([lat, lng, place]) =>
        L.circleMarker([lat, lng], {
          renderer,
          radius: 6,
          color: "#fff",
          weight: 1.5,
          fillColor: COLORS.bell,
          fillOpacity: 1,
        }).bindTooltip(`안전비상벨${place ? ` · ${place}` : ""}`)
      )
    );

    groupsRef.current = { ...groupsRef.current, ...groups };
    return () => {
      // 지역이 바뀌면 옛 지역 레이어를 지우고 목록에서도 빼야, 아래 켜기·끄기 효과가 다시 붙이지 않음
      for (const [id, g] of Object.entries(groups) as [LayerId, L.LayerGroup][]) {
        g.remove();
        if (groupsRef.current[id] === g) delete groupsRef.current[id];
      }
      // 다 쓴 그림판(캔버스)도 지움 (지역을 오갈 때 쌓이지 않게)
      renderer.remove();
    };
  }, [data]);

  // 큰길 조명(추정): 도로 데이터에서 가로등이 있다고 본 구간을 은은한 빛줄기로 표시
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !graph) return;
    const renderer = L.canvas({ padding: 0.5 });
    const lines: L.LatLngTuple[][] = [];
    for (const e of graph.raw.edges) {
      if (!(e[5] & FLAG_STREETLIGHT)) continue;
      const [u, v, , , , , , geom] = e;
      const pts: L.LatLngTuple[] = [[graph.lat[u], graph.lng[u]]];
      for (let j = 0; j < geom.length; j += 2) pts.push([geom[j], geom[j + 1]]);
      pts.push([graph.lat[v], graph.lng[v]]);
      lines.push(pts);
    }
    const group = L.layerGroup([
      L.polyline(lines, { renderer, color: COLORS.street, weight: 7, opacity: 0.12, interactive: false }),
      L.polyline(lines, { renderer, color: COLORS.street, weight: 2, opacity: 0.45, interactive: false }),
    ]);
    groupsRef.current = { ...groupsRef.current, street: group };
    if (visible.street) group.addTo(map);
    return () => {
      group.remove();
      if (groupsRef.current.street === group) delete groupsRef.current.street;
      renderer.remove();
    };
    // visible 은 아래 효과에서 반영하므로 여기서는 처음 한 번만 봅니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // 켜기·끄기 반영 (보안등은 1만 개가 넘어서 멀리서 보면 화면을 뒤덮으므로 가까이 볼 때만)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, group] of Object.entries(groupsRef.current) as [LayerId, L.LayerGroup][]) {
      const show = visible[id] && (id !== "lamp" || zoom >= LAMP_MIN_ZOOM);
      if (show && !map.hasLayer(group)) group.addTo(map);
      if (!show && map.hasLayer(group)) group.remove();
    }
  }, [visible, data, graph, zoom]);

  // 길 안내: 내 위치 표시와 따라가기
  useEffect(() => {
    const map = mapRef.current;
    const layer = meLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!me) return;
    L.circle([me.lat, me.lng], {
      pane: "mePane",
      radius: Math.min(me.acc, 100),
      color: "#4ea8ff",
      weight: 1,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(layer);
    L.circleMarker([me.lat, me.lng], {
      pane: "mePane",
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: "#4ea8ff",
      fillOpacity: 1,
      interactive: false,
    }).addTo(layer);
    if (follow) {
      // 패널에 가리지 않게: 휴대폰은 내 위치가 화면 위쪽에, 넓은 화면은 왼쪽 패널 오른편에 오도록
      const zoom = map.getZoom();
      const wide = window.innerWidth >= 768;
      const offset = wide ? L.point(-200, 0) : L.point(0, Math.round(window.innerHeight * 0.22));
      const center = map.unproject(map.project([me.lat, me.lng], zoom).add(offset), zoom);
      map.panTo(center, { animate: true });
    }
  }, [me, follow]);

  // 시민 제보 표시 (메모는 사용자가 쓴 글이라 HTML로 해석되지 않게 이스케이프)
  useEffect(() => {
    const map = mapRef.current;
    const layer = reportLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const r of reports ?? []) {
      const k = REPORT_KINDS.find((x) => x.id === r.kind);
      L.marker([r.lat, r.lng], {
        pane: "routePane",
        icon: L.divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;border-radius:50%;background:#1b2542;border:2px solid #fbbf24;display:grid;place-items:center;font-size:13px">${k?.icon ?? "⚠️"}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      })
        .bindPopup(`<b>${k?.label ?? "제보"}</b> · ${ago(r.created_at)}${r.note ? `<br>${escapeHtml(r.note)}` : ""}`)
        .addTo(layer);
    }
    if (mark) {
      L.circleMarker([mark.lat, mark.lng], { pane: "mePane", radius: 10, color: "#fbbf24", weight: 3, fillOpacity: 0.3 })
        .bindTooltip("제보할 위치", { permanent: true, direction: "top", className: "place-label" })
        .addTo(layer);
      // 패널에 가리지 않게 (휴대폰은 위쪽, 넓은 화면은 패널 오른편)
      const zoom = map.getZoom();
      const wide = window.innerWidth >= 768;
      const offset = wide ? L.point(-200, 0) : L.point(0, Math.round(window.innerHeight * 0.22));
      map.panTo(map.unproject(map.project([mark.lat, mark.lng], zoom).add(offset), zoom));
    }
  }, [reports, mark]);

  // 출발·도착 핀
  useEffect(() => {
    const layer = pinLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (from) L.marker([from.lat, from.lng], { icon: pinIcon("출", "#ffd166"), interactive: false }).addTo(layer);
    if (to) L.marker([to.lat, to.lng], { icon: pinIcon("도", "#34d399"), interactive: false }).addTo(layer);
  }, [from, to]);

  // 경로 그리기
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!safe) return;

    if (short) {
      L.polyline(
        short.segments.flatMap((s) => s.path),
        { pane: "routePane", color: "#cbd5e1", weight: 4, opacity: 0.7, dashArray: "2 9", lineCap: "round", interactive: false }
      ).addTo(layer);
    }
    // 안심 경로: 바깥 테두리 + 구간별 색
    const all = safe.segments.flatMap((s) => s.path);
    L.polyline(all, { pane: "routePane", color: "#0b1020", weight: 10, opacity: 0.9, interactive: false }).addTo(layer);
    for (const s of safe.segments) {
      L.polyline(s.path, { pane: "routePane", color: scoreColor(s.score, s.flags), weight: 6, opacity: 1, lineCap: "round", interactive: false }).addTo(layer);
    }
    const bounds = L.latLngBounds(all);
    if (short) bounds.extend(L.latLngBounds(short.segments.flatMap((s) => s.path)));
    // 패널에 가리지 않게 여백: 넓은 화면은 왼쪽 패널, 휴대폰은 아래쪽 패널만큼
    const wide = window.innerWidth >= 768;
    map.fitBounds(bounds, {
      paddingTopLeft: wide ? [420, 40] : [24, 80],
      paddingBottomRight: wide ? [40, 40] : [24, Math.round(window.innerHeight * 0.55) + 24],
      maxZoom: 17,
    });
  }, [safe, short]);

  return <div ref={containerRef} className="absolute inset-0 z-0" aria-label="안전시설과 경로 지도" role="application" />;
}
