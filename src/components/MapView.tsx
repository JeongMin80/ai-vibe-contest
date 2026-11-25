"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PLACES, type FacilityData, type LayerId } from "@/lib/facilities";

interface Props {
  data: FacilityData | null;
  visible: Record<LayerId, boolean>;
}

const COLORS: Record<LayerId, string> = {
  cctv: "#4ea8ff",
  lamp: "#ffb020",
  street: "#ffe27a",
  bell: "#ff5d6c",
};

export default function MapView({ data, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupsRef = useRef<Partial<Record<LayerId, L.LayerGroup>>>({});

  // 지도 생성 (한 번만)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [PLACES[0].lat, PLACES[0].lng],
      zoom: 15,
      minZoom: 12,
      maxZoom: 19,
      preferCanvas: true,
      zoomControl: false,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    // 키가 필요 없는 OpenStreetMap 기본 타일을 쓰고, CSS 필터(.dark-tiles)로 어둡게 바꿉니다.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "dark-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map);

    for (const p of PLACES) {
      L.circleMarker([p.lat, p.lng], { radius: 6, color: "#ffd166", weight: 2, fillOpacity: 1, fillColor: "#ffd166" })
        .bindTooltip(p.name, { permanent: true, direction: "top", offset: [0, -8], className: "place-label" })
        .addTo(map);
    }
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      groupsRef.current = {};
    };
  }, []);

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
        }).bindPopup(`CCTV · 카메라 ${cams}대`)
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
        }).bindPopup(`안전비상벨${place ? ` · ${place}` : ""}`)
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

  return <div ref={containerRef} className="absolute inset-0" aria-label="안전시설 지도" role="application" />;
}
