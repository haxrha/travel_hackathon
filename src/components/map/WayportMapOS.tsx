"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Route, TripStop } from "@/lib/mapbox/types";
import { formatDistance, formatDuration } from "@/lib/mapbox/types";
import { cn, formatCurrency } from "@/lib/utils";
import { Plane, Hotel, Utensils, Landmark, MapPin, Footprints, Car } from "lucide-react";

// Serve the worker from /public so Turbopack doesn't break Mapbox's Actor (sendCancelable).
if (typeof window !== "undefined") {
  mapboxgl.workerUrl = `${window.location.origin}/mapbox-gl-csp-worker.js`;
}

const KIND_ICON: Record<string, typeof Plane> = {
  FLIGHT: Plane,
  HOTEL: Hotel,
  RESTAURANT: Utensils,
  ACTIVITY: Landmark,
  LANDMARK: Landmark,
  EXPERIENCE: Landmark,
  TRANSFER: Car,
  TRANSIT: Car,
  EVENT: Landmark,
};

type Props = {
  tripId: string;
  tripTitle: string;
  destination: string;
  initialDay?: number;
  /** All trips, for the switcher. Omitted or single-entry hides it. */
  trips?: { id: string; title: string; destination?: string }[];
};

export default function WayportMapOS({
  tripId,
  tripTitle,
  destination,
  initialDay = 0,
  trips,
}: Props) {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const stopsRef = useRef<TripStop[]>([]);
  const routeRef = useRef<Route | null>(null);
  /** Bumps whenever tripId changes so in-flight fetches for the old trip are ignored. */
  const tripGen = useRef(0);

  const [day, setDay] = useState(initialDay);
  const [days, setDays] = useState<number[]>([0]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [allStops, setAllStops] = useState<TripStop[]>([]);
  const [route, setRoute] = useState<Route | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [mode, setMode] = useState<"walking" | "driving">("walking");
  const [agentLog, setAgentLog] = useState<string[]>(["Graph loaded", "Routing day stops…"]);
  const [replanning, setReplanning] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [activeTitle, setActiveTitle] = useState(tripTitle);
  const [activeDestination, setActiveDestination] = useState(destination);
  const prevGeomRef = useRef<GeoJSON.LineString | null>(null);

  stopsRef.current = stops;
  routeRef.current = route;

  /**
   * Token mirrored into a ref.
   *
   * Async continuations below outlive the render that scheduled them. Reading
   * `token` from a closure there sees the value as of mount — null — long after
   * a live map exists, which previously caused the fallback canvas to overwrite
   * a working Mapbox instance. Always read the ref inside async callbacks.
   */
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  /** Last day/mode/trip fetch key — avoids duplicate routing requests. */
  const loadedKey = useRef<string | null>(null);

  async function load(forTripId: string, dayOffset: number, transport: "walking" | "driving", gen: number) {
    const res = await fetch(
      `/api/routing?tripId=${encodeURIComponent(forTripId)}&dayOffset=${dayOffset}&mode=${transport}`,
    );
    const data = await res.json();
    if (gen !== tripGen.current) return null; // stale response from a previous trip
    if (!res.ok) {
      setAgentLog((l) => [...l.slice(-4), `Routing failed: ${data.error ?? res.status}`]);
      return null;
    }
    setStops(data.stops ?? []);
    setAllStops(data.allStops ?? []);
    setRoute(data.route);
    setDays(data.days?.length ? data.days : [0]);
    if (data.trip?.title) setActiveTitle(data.trip.title);
    if (data.trip?.destination) setActiveDestination(data.trip.destination);
    const t =
      typeof data.mapboxToken === "string" && data.mapboxToken.startsWith("pk.")
        ? data.mapboxToken
        : null;
    tokenRef.current = t;
    setToken(t);
    setAgentLog((l) => [
      ...l.slice(-4),
      `Loaded ${data.trip?.destination ?? forTripId} · day ${dayOffset + 1} · ${
        data.route ? formatDuration(data.route.durationSeconds) : `${(data.stops ?? []).length} stops`
      }`,
    ]);
    return data;
  }

  // Full reset + fetch whenever the selected trip changes.
  useEffect(() => {
    const gen = ++tripGen.current;
    setDay(0);
    setMode("walking");
    setSelected(null);
    setHover(null);
    setStops([]);
    setAllStops([]);
    setRoute(null);
    setDays([0]);
    setReady(false);
    setMapError(null);
    setActiveTitle(tripTitle);
    setActiveDestination(destination);
    setAgentLog([`Switching to ${tripTitle}…`, "Routing day stops…"]);
    loadedKey.current = `0|walking|${tripId}`;

    load(tripId, 0, "walking", gen).then((data) => {
      if (gen !== tripGen.current) return;
      setReady(true);
      const map = mapObj.current;
      if (map && data) {
        const apply = () => {
          paint(map, data.stops ?? [], data.route, null, null);
          fit(map, data.stops ?? []);
        };
        if (map.isStyleLoaded()) apply();
        else map.once("load", apply);
      } else if (!tokenRef.current && mapRef.current && data) {
        drawFallback(mapRef.current, data.stops ?? [], data.route, null, null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Create Mapbox map once we have a public token. Strict-mode safe.
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (!token) {
      drawFallback(mapRef.current, stopsRef.current, routeRef.current, selected, hover);
      return;
    }

    let cancelled = false;
    const container = mapRef.current;

    if (mapObj.current) {
      mapObj.current.remove();
      mapObj.current = null;
      markersRef.current = [];
    }
    container.replaceChildren();
    setMapError(null);

    if (!mapboxgl.supported()) {
      setMapError("WebGL is not available in this browser — showing fallback map.");
      drawFallback(container, stopsRef.current, routeRef.current, selected, hover);
      return;
    }

    try {
      mapboxgl.accessToken = token;
      const centerStop = stopsRef.current[0];
      const map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/dark-v11",
        center: centerStop ? [centerStop.lng, centerStop.lat] : [135.7681, 35.0116],
        zoom: 12.2,
        pitch: 48,
        bearing: -18,
        antialias: true,
      });
      mapObj.current = map;
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

      map.on("error", (e) => {
        const msg = e?.error?.message ?? "Mapbox failed to load tiles";
        if (cancelled) return;
        setMapError(msg);
        setAgentLog((l) => [...l.slice(-4), `Map error: ${msg}`]);
        if (/sendCancelable|worker|Actor/i.test(msg) && mapRef.current) {
          try {
            map.remove();
          } catch {
            /* */
          }
          mapObj.current = null;
          drawFallback(mapRef.current, stopsRef.current, routeRef.current, selected, hover);
        }
      });

      const onReady = () => {
        if (cancelled) return;
        map.resize();
        paint(map, stopsRef.current, routeRef.current, selected, hover);
        fit(map, stopsRef.current);
        setAgentLog((l) => [...l.slice(-4), "Mapbox tiles live ✓"]);
      };
      map.once("load", onReady);
      requestAnimationFrame(() => {
        if (!cancelled && mapObj.current) mapObj.current.resize();
      });

      return () => {
        cancelled = true;
        map.remove();
        if (mapObj.current === map) mapObj.current = null;
        markersRef.current = [];
        if (mapRef.current) mapRef.current.replaceChildren();
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start Mapbox";
      setMapError(msg);
      drawFallback(container, stopsRef.current, routeRef.current, selected, hover);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, tripId]);

  useEffect(() => {
    const key = `${day}|${mode}|${tripId}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    const gen = tripGen.current;
    load(tripId, day, mode, gen).then((data) => {
      if (!data || gen !== tripGen.current) return;
      const map = mapObj.current;
      if (map) {
        const apply = () => {
          paint(map, data.stops, data.route, selected, hover, true);
          fit(map, data.stops);
        };
        if (map.isStyleLoaded()) apply();
        else map.once("load", apply);
      } else if (!tokenRef.current && mapRef.current) {
        drawFallback(mapRef.current, data.stops, data.route, selected, hover);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, mode]);

  useEffect(() => {
    const map = mapObj.current;
    if (map) {
      if (map.isStyleLoaded()) paint(map, stops, route, selected, hover);
      return;
    }
    if (!tokenRef.current && mapRef.current) {
      drawFallback(mapRef.current, stops, route, selected, hover);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hover, stops, route]);

  function paint(
    map: mapboxgl.Map,
    dayStops: TripStop[],
    r: Route | null,
    sel: string | null,
    hov: string | null,
    morph = false,
  ) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const geom = r?.geometry ?? { type: "LineString" as const, coordinates: [] as [number, number][] };

    // Morph: keep previous route as ghost, fade it out, draw new route in
    if (morph && prevGeomRef.current && map.getSource("wayport-route")) {
      if (map.getLayer("wayport-route-old-line")) map.removeLayer("wayport-route-old-line");
      if (map.getSource("wayport-route-old")) map.removeSource("wayport-route-old");
      map.addSource("wayport-route-old", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: prevGeomRef.current },
      });
      map.addLayer({
        id: "wayport-route-old-line",
        type: "line",
        source: "wayport-route-old",
        paint: {
          "line-color": "#8a6a55",
          "line-width": 3,
          "line-opacity": 0.55,
          "line-dasharray": [2, 2],
        },
      });
      let opacity = 0.55;
      const fade = window.setInterval(() => {
        opacity -= 0.07;
        if (!map.getLayer("wayport-route-old-line")) {
          clearInterval(fade);
          return;
        }
        map.setPaintProperty("wayport-route-old-line", "line-opacity", Math.max(0, opacity));
        if (opacity <= 0) {
          clearInterval(fade);
          if (map.getLayer("wayport-route-old-line")) map.removeLayer("wayport-route-old-line");
          if (map.getSource("wayport-route-old")) map.removeSource("wayport-route-old");
        }
      }, 80);
    }

    if (r?.geometry) prevGeomRef.current = r.geometry as GeoJSON.LineString;

    if (map.getSource("wayport-route")) {
      (map.getSource("wayport-route") as mapboxgl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: geom,
      });
      if (morph && map.getLayer("wayport-route-line")) {
        map.setPaintProperty("wayport-route-line", "line-opacity", 0.15);
        let op = 0.15;
        const drawIn = window.setInterval(() => {
          op += 0.12;
          if (!map.getLayer("wayport-route-line")) {
            clearInterval(drawIn);
            return;
          }
          map.setPaintProperty("wayport-route-line", "line-opacity", Math.min(0.95, op));
          if (op >= 0.95) clearInterval(drawIn);
        }, 70);
      }
    } else if (r) {
      map.addSource("wayport-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: r.geometry },
      });
      map.addLayer({
        id: "wayport-route-glow",
        type: "line",
        source: "wayport-route",
        paint: {
          "line-color": "#e8905a",
          "line-width": 10,
          "line-opacity": 0.25,
          "line-blur": 4,
        },
      });
      map.addLayer({
        id: "wayport-route-line",
        type: "line",
        source: "wayport-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f4a261",
          "line-width": 4.5,
          "line-opacity": morph ? 0.2 : 0.95,
        },
      });
      if (morph && map.getLayer("wayport-route-line")) {
        let op = 0.2;
        const drawIn = window.setInterval(() => {
          op += 0.12;
          if (!map.getLayer("wayport-route-line")) {
            clearInterval(drawIn);
            return;
          }
          map.setPaintProperty("wayport-route-line", "line-opacity", Math.min(0.95, op));
          if (op >= 0.95) clearInterval(drawIn);
        }, 70);
      }
    }

    // Stops at the same place (a hotel used twice, a venue across two days)
    // would otherwise stack into one clickable pin with the rest hidden
    // underneath. Group them and label the group with how many it covers.
    const groups = new Map<string, { stops: TripStop[]; indices: number[] }>();
    dayStops.forEach((s, i) => {
      const key = `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`;
      const g = groups.get(key);
      if (g) {
        g.stops.push(s);
        g.indices.push(i);
      } else {
        groups.set(key, { stops: [s], indices: [i] });
      }
    });

    for (const { stops: group, indices } of groups.values()) {
      const primary = group[0];
      const el = document.createElement("button");
      el.className = "wp-map-marker";
      el.type = "button";

      const label =
        group.length > 1
          ? `${indices[0] + 1}+${group.length - 1}`
          : String(indices[0] + 1);
      el.innerHTML = `<span>${label}</span>`;
      el.setAttribute(
        "aria-label",
        group.length > 1
          ? `${group.length} stops here: ${group.map((s) => s.title).join(", ")}`
          : primary.title,
      );
      el.title = group.map((s) => s.title).join("\n");

      if (group.some((s) => sel === s.id || hov === s.id)) el.classList.add("is-active");

      el.onclick = () => {
        // Cycle through co-located stops on repeated clicks.
        const current = group.findIndex((s) => s.id === sel);
        const next = group[(current + 1) % group.length];
        setSelected(next.id);
        map.flyTo({ center: [primary.lng, primary.lat], zoom: 14.5, pitch: 55, duration: 900 });
      };

      markersRef.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat([primary.lng, primary.lat]).addTo(map),
      );
    }
  }

  /**
   * Frames the day's stops.
   *
   * Fitting every stop is wrong when a day contains a long-haul flight: day 1
   * of a Kyoto trip holds both JFK and Kansai, and the naive bounds zoom out to
   * the whole Pacific, shrinking the places you actually visit to a dot. So we
   * frame the densest cluster — the destination — and leave the outliers
   * on the map to be panned to.
   */
  function fit(map: mapboxgl.Map, dayStops: TripStop[]) {
    if (dayStops.length === 0) return;
    if (dayStops.length === 1) {
      map.flyTo({ center: [dayStops[0].lng, dayStops[0].lat], zoom: 13.5, pitch: 50, duration: 800 });
      return;
    }

    const focus = densestCluster(dayStops);
    const b = new mapboxgl.LngLatBounds();
    focus.forEach((s) => b.extend([s.lng, s.lat]));

    // Padding larger than the container makes fitBounds throw.
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const padding = Math.max(24, Math.min(100, Math.floor(Math.min(w, h) / 5)));

    if (focus.length === 1) {
      map.flyTo({ center: [focus[0].lng, focus[0].lat], zoom: 13.5, pitch: 50, duration: 800 });
      return;
    }
    map.fitBounds(b, { padding, pitch: 45, duration: 900, maxZoom: 14 });
  }

  /**
   * Largest group of stops within ~1.5° of each other (roughly a metro area).
   * Falls back to all stops when they're already close together.
   */
  function densestCluster(all: TripStop[], degrees = 1.5): TripStop[] {
    const span = (arr: TripStop[], k: "lat" | "lng") =>
      Math.max(...arr.map((s) => s[k])) - Math.min(...arr.map((s) => s[k]));
    if (span(all, "lat") <= degrees * 2 && span(all, "lng") <= degrees * 2) return all;

    let best: TripStop[] = [];
    for (const seed of all) {
      const near = all.filter(
        (s) => Math.abs(s.lat - seed.lat) <= degrees && Math.abs(s.lng - seed.lng) <= degrees,
      );
      if (near.length > best.length) best = near;
    }
    return best.length ? best : all;
  }

  function drawFallback(
    container: HTMLDivElement,
    dayStops: TripStop[],
    r: Route | null,
    sel: string | null,
    hov: string | null,
    morph = false,
  ) {
    // Hard guard: a live Mapbox instance owns this container. Clearing it here
    // would destroy the GL canvas, and the map has no way to recover.
    if (mapObj.current) return;

    let canvas = container.querySelector("canvas.wp-fallback-map") as HTMLCanvasElement | null;
    if (!canvas) {
      container.innerHTML = "";
      canvas = document.createElement("canvas");
      canvas.className = "wp-fallback-map absolute inset-0 h-full w-full";
      container.appendChild(canvas);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // twilight base
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1a100c");
    g.addColorStop(0.45, "#2a1810");
    g.addColorStop(1, "#0c0806");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = "rgba(232,144,90,0.06)";
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!dayStops.length) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "14px IBM Plex Sans, sans-serif";
      ctx.fillText("No stops for this day", 24, 40);
      return;
    }

    const lngs = dayStops.map((s) => s.lng);
    const lats = dayStops.map((s) => s.lat);
    const minLng = Math.min(...lngs) - 0.02;
    const maxLng = Math.max(...lngs) + 0.02;
    const minLat = Math.min(...lats) - 0.02;
    const maxLat = Math.max(...lats) + 0.02;
    const project = (lng: number, lat: number) => {
      const x = ((lng - minLng) / (maxLng - minLng || 1)) * (w - 80) + 40;
      const y = (1 - (lat - minLat) / (maxLat - minLat || 1)) * (h - 80) + 40;
      return [x, y] as const;
    };

    // route glow + line
    const coords = (r?.geometry.coordinates as [number, number][]) ?? dayStops.map((s) => [s.lng, s.lat] as [number, number]);
    if (coords.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (morph) {
        // ghost previous path offset slightly
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(138,106,85,0.45)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        coords.forEach(([lng, lat], i) => {
          const [x, y] = project(lng + 0.004, lat + 0.003);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "rgba(232,144,90,0.28)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      coords.forEach(([lng, lat], i) => {
        const [x, y] = project(lng, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = "#f4a261";
      ctx.lineWidth = 4;
      ctx.globalAlpha = morph ? 0.85 : 1;
      ctx.beginPath();
      coords.forEach(([lng, lat], i) => {
        const [x, y] = project(lng, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    dayStops.forEach((s, i) => {
      const [x, y] = project(s.lng, s.lat);
      const active = sel === s.id || hov === s.id;
      ctx.beginPath();
      ctx.arc(x, y, active ? 14 : 11, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#e8905a" : "#1a100c";
      ctx.fill();
      ctx.strokeStyle = "#f4a261";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = active ? "#1a100c" : "#faf6f1";
      ctx.font = "600 11px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, y);
    });

    canvas.onclick = (e) => {
      const rect = canvas!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      let bestId: string | null = null;
      let bestD = 24;
      for (const s of dayStops) {
        const [x, y] = project(s.lng, s.lat);
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          bestD = d;
          bestId = s.id;
        }
      }
      if (bestId) setSelected(bestId);
    };
  }

  async function simulateReplan() {
    setReplanning(true);
    setAgentLog(["✦ WAYPORT", "Checking weather… ✓", "Checking opening hours… ✓", "Recalculating route… ●"]);
    await new Promise((r) => setTimeout(r, 500));
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        type: "WEATHER_CHANGED",
        payload: { condition: "rain", summary: "Afternoon rain — outdoor swap" },
      }),
    }).catch(() => {});
    setAgentLog((l) => [...l, "3 constraints satisfied", "Old route fading… new route drawing in…"]);
    const data = await load(tripId, day, mode, tripGen.current);
    const map = mapObj.current;
    if (map && map.isStyleLoaded() && data) {
      paint(map, data.stops, data.route, selected, hover, true);
      fit(map, data.stops);
    } else if (!token && mapRef.current && data) {
      drawFallback(mapRef.current, data.stops, data.route, selected, hover, true);
    }
    setReplanning(false);
    setAgentLog((l) => [...l, "Timeline + map synced ✓"]);
  }

  const selectedStop = stops.find((s) => s.id === selected) ?? null;
  const dayTotal = stops.reduce((s, x) => s + (x.priceUsd ?? 0), 0);

  return (
    <div className="relative h-full min-h-[640px] w-full overflow-hidden rounded-none">
      {/* Map foundation */}
      <div ref={mapRef} className="absolute inset-0 z-0 h-full w-full bg-[#0c0806]" />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 md:p-5">
        <div className="pointer-events-auto wp-map-panel max-w-md px-4 py-3">
          <div className="font-display text-xs tracking-[0.28em]">WAYPORT</div>
          <div className="mt-1 text-lg font-semibold leading-tight">{activeTitle}</div>
          <div className="text-xs text-text-tertiary">{activeDestination}</div>

          {/* Every trip's map is reachable, not just whichever sorts first. */}
          {trips && trips.length > 1 && (
            <select
              aria-label="Switch trip"
              className="wp-select mt-2.5 !py-1.5 !text-xs"
              value={tripId}
              onChange={(e) => {
                const next = e.target.value;
                if (next && next !== tripId) {
                  router.push(`/app?tripId=${encodeURIComponent(next)}`);
                }
              }}
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.destination ? ` · ${t.destination}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md transition",
                day === d ? "bg-ember text-[#1a100c]" : "bg-black/40 text-white ring-1 ring-white/15 hover:bg-black/55",
              )}
            >
              Day {d + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Left timeline — starts below the header card, which grows when the
          trip switcher is present. */}
      <aside
        className={cn(
          "absolute bottom-24 left-4 z-20 hidden w-[300px] flex-col md:flex",
          trips && trips.length > 1 ? "top-44" : "top-28",
        )}
      >
        <div className="wp-map-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="wp-eyebrow">Itinerary</div>
            <div className="mt-1 text-sm text-text-secondary">Day {day + 1} · synced to map</div>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto p-2">
            {stops.map((s, i) => {
              const Icon = KIND_ICON[s.kind] ?? MapPin;
              const active = selected === s.id || hover === s.id;
              const leg = route?.legs[i];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHover(s.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => {
                      setSelected(s.id);
                      mapObj.current?.flyTo({ center: [s.lng, s.lat], zoom: 14.5, pitch: 55, duration: 900 });
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition",
                      active ? "bg-ember/20 ring-1 ring-ember/40" : "hover:bg-white/5",
                    )}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/40 text-[11px] font-semibold text-ember">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Icon size={12} className="text-ember" />
                        <span className="truncate">{s.title}</span>
                      </span>
                      {s.location ? (
                        <span className="mt-0.5 block truncate text-[11px] text-text-secondary">{s.location}</span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-text-tertiary">
                        {s.kind}
                        {s.priceUsd != null ? ` · ${formatCurrency(s.priceUsd)}` : ""}
                      </span>
                    </span>
                  </button>
                  {leg && i < stops.length - 1 && (
                    <div className="ml-8 border-l border-dashed border-white/15 py-1 pl-4 text-[10px] text-text-tertiary">
                      ↓ {formatDuration(leg.durationSeconds)} · {formatDistance(leg.distanceMeters)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Right agent / selected */}
      <aside className="absolute bottom-24 right-4 top-28 z-20 hidden w-[280px] flex-col gap-3 lg:flex">
        <div className="wp-map-panel p-4">
          <div className="wp-eyebrow">✦ WAYPORT</div>
          <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-text-secondary">
            {agentLog.slice(-6).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={replanning}
            onClick={simulateReplan}
            className="wp-cta mt-4 w-full py-2 text-xs"
          >
            {replanning ? "Replanning…" : "Simulate disruption"}
          </button>
        </div>
        {selectedStop && (
          <div className="wp-map-panel flex-1 overflow-y-auto p-4">
            <div className="wp-eyebrow">{selectedStop.kind}</div>
            <h3 className="mt-1 font-display text-xl">{selectedStop.title}</h3>
            {selectedStop.location ? (
              <p className="mt-1 text-xs text-text-secondary">{selectedStop.location}</p>
            ) : null}
            {selectedStop.priceUsd != null && (
              <div className="mt-2 text-ember">{formatCurrency(selectedStop.priceUsd)}</div>
            )}
            {selectedStop.description && (
              <p className="mt-3 text-sm text-text-secondary">{selectedStop.description}</p>
            )}
            {selectedStop.whatToDo && selectedStop.whatToDo.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-xs text-text-secondary">
                {selectedStop.whatToDo.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ember">·</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* Bottom route summary */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-4 md:px-4 md:pb-4 md:pl-[328px] md:pr-[308px]">
        <div className="wp-map-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="text-sm">
            <span className="text-text-tertiary">Route · </span>
            {route ? (
              <span>
                {formatDuration(route.durationSeconds)} · {formatDistance(route.distanceMeters)} · {stops.length} stops
              </span>
            ) : (
              <span>{stops.length} stop{stops.length === 1 ? "" : "s"}</span>
            )}
            <span className="ml-3 text-ember">{formatCurrency(dayTotal)} day est.</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("walking")}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", mode === "walking" ? "bg-ember text-[#1a100c]" : "bg-white/5")}
            >
              <Footprints size={12} /> Walk
            </button>
            <button
              type="button"
              onClick={() => setMode("driving")}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", mode === "driving" ? "bg-ember text-[#1a100c]" : "bg-white/5")}
            >
              <Car size={12} /> Drive
            </button>
          </div>
        </div>
        {mapError && (
          <p className="mt-2 text-center text-[11px] text-red-400">
            {mapError.includes("sk.")
              ? "Use a public Mapbox token (pk.…), not a secret (sk.…)."
              : mapError}
          </p>
        )}
        {!token && !mapError && (
          <p className="mt-2 text-center text-[10px] text-text-tertiary">
            Add a public <code className="text-ember">pk.…</code> token as{" "}
            <code className="text-ember">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> · mock geo routing active
          </p>
        )}
        {token && !mapError && (
          <p className="mt-2 text-center text-[10px] text-text-tertiary">Mapbox live · public token</p>
        )}
      </div>
    </div>
  );
}
