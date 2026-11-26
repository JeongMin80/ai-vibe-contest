"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PLACES, SERVICE_AREA, type FacilityData, type LayerId } from "@/lib/facilities";
import { scoreColor, type Route } from "@/lib/routing";

export interface Point {
  lat: number;
  lng: number;
  label: string;
}

interface Props {
  data: FacilityData | null;
  visible: Record<LayerId, boolean>;
  from: Point | null;
  to: Point | null;
  safe: Route | null;
  short: Route | null;
  /** 지도를 누르면 호출 (경로 모드일 때만) */
  onPick?: (lat: number, lng: number) => void;
  picking: boolean;
}

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

export default function MapView({ data, visible, from, to, safe, short, onPick, picking }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupsRef = useRef<Partial<Record<LayerId, L.LayerGroup>>>({});
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // 지도 생성 (한 번만)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [PLACES[0].lat, PLACES[0].lng],
      zoom: 15,
      minZoom: 13,
      maxZoom: 19,
      preferCanvas: true,
      zoomControl: false,
      maxBounds: L.latLngBounds(
        [SERVICE_AREA.south - 0.03, SERVICE_AREA.west - 0.04],
        [SERVICE_AREA.north + 0.03, SERVICE_AREA.east + 0.04]
      ),
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    // 키가 필요 없는 OpenStreetMap 기본 타일을 쓰고, CSS 필터(.dark-tiles)로 어둡게 바꿉니다.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "dark-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map);

    // 서비스 지역 밖은 살짝 어둡게
    const world: L.LatLngTuple[] = [
      [-89, -179],
      [-89, 179],
      [89, 179],
      [89, -179],
    ];
    const area: L.LatLngTuple[] = [
      [SERVICE_AREA.south, SERVICE_AREA.west],
      [SERVICE_AREA.south, SERVICE_AREA.east],
      [SERVICE_AREA.north, SERVICE_AREA.east],
      [SERVICE_AREA.north, SERVICE_AREA.west],
    ];
    L.polygon([world, area], { stroke: false, fillColor: "#000", fillOpacity: 0.45, interactive: false }).addTo(map);

    for (const p of PLACES) {
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#ffd166", weight: 2, fillOpacity: 1, fillColor: "#ffd166" })
        .bindTooltip(p.name, { permanent: true, direction: "top", offset: [0, -6], className: "place-label" })
        .addTo(map);
    }

    routeLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      groupsRef.current = {};
    };
  }, []);

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
    groups.street = L.layerGroup(
      data.street.map(([lat, lng]) =>
        L.circleMarker([lat, lng], { renderer, radius: 2, color: COLORS.street, weight: 0, fillOpacity: 0.7 })
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

    groupsRef.current = groups;
    return () => {
      for (const g of Object.values(groups)) g?.remove();
    };
  }, [data]);

  // 켜기·끄기 반영
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, group] of Object.entries(groupsRef.current) as [LayerId, L.LayerGroup][]) {
      if (visible[id] && !map.hasLayer(group)) group.addTo(map);
      if (!visible[id] && map.hasLayer(group)) group.remove();
    }
  }, [visible, data]);

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
        { color: "#cbd5e1", weight: 4, opacity: 0.7, dashArray: "2 9", lineCap: "round", interactive: false }
      ).addTo(layer);
    }
    // 안심 경로: 바깥 테두리 + 구간별 색
    const all = safe.segments.flatMap((s) => s.path);
    L.polyline(all, { color: "#0b1020", weight: 10, opacity: 0.9, interactive: false }).addTo(layer);
    for (const s of safe.segments) {
      L.polyline(s.path, { color: scoreColor(s.score, s.flags), weight: 6, opacity: 1, lineCap: "round", interactive: false }).addTo(layer);
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

  return <div ref={containerRef} className="absolute inset-0" aria-label="안전시설과 경로 지도" role="application" />;
}
