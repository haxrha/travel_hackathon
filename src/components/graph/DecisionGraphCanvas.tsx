"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type {
  DecisionGraphData,
  GraphCandidate,
  GraphCategory,
  GraphSubcategory,
  CategoryType,
} from "@/lib/graph/decision-space";
import { formatCurrency } from "@/lib/utils";

export type FilterId = "all" | "selected" | CategoryType;
export type GraphMode = "graph" | "activity";

type Props = {
  data: DecisionGraphData;
  filter: FilterId;
  mode: GraphMode;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onSelectCandidate: (c: GraphCandidate | null) => void;
  selectedCandidate: GraphCandidate | null;
};

function CategoryNode({
  cat,
  dim,
  onClick,
}: {
  cat: GraphCategory;
  dim: boolean;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 0.8 + cat.position[0]) * 0.03;
    ref.current.scale.setScalar(s);
  });
  return (
    <group position={cat.position}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshStandardMaterial
          color="#e8905a"
          emissive="#c45c26"
          emissiveIntensity={dim ? 0.15 : 0.55}
          transparent
          opacity={dim ? 0.25 : 0.95}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>
      {!dim && (
        <Html distanceFactor={18} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full border border-ember/30 bg-black/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ember backdrop-blur-sm">
            {cat.label}
          </div>
        </Html>
      )}
    </group>
  );
}

function SubcategoryNode({
  sub,
  dim,
  onClick,
}: {
  sub: GraphSubcategory;
  dim: boolean;
  onClick: () => void;
}) {
  return (
    <group position={sub.position}>
      <mesh onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial
          color="#d4845a"
          emissive="#8a4a28"
          emissiveIntensity={dim ? 0.05 : 0.35}
          transparent
          opacity={dim ? 0.15 : 0.75}
        />
      </mesh>
      {!dim && (
        <Html distanceFactor={14} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap text-[9px] text-white/55">{sub.label}</div>
        </Html>
      )}
    </group>
  );
}

function SelectedNode({
  cand,
  active,
  activityPulse,
  onHover,
  onClick,
}: {
  cand: GraphCandidate;
  active: boolean;
  activityPulse: number;
  onHover: (c: GraphCandidate | null) => void;
  onClick: () => void;
}) {
  const ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.rotation.z = clock.elapsedTime * 0.6;
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.2) * 0.08 + activityPulse * 0.15;
      ring.current.scale.setScalar(pulse);
    }
  });
  return (
    <group position={cand.position}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); onHover(cand); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = "auto"; }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <sphereGeometry args={[0.42, 28, 28]} />
        <meshStandardMaterial
          color="#f4a261"
          emissive="#e8905a"
          emissiveIntensity={active ? 1.2 : 0.85}
          roughness={0.2}
          metalness={0.35}
        />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.025, 8, 48]} />
        <meshBasicMaterial color="#f4a261" transparent opacity={0.85} />
      </mesh>
      <Html distanceFactor={12} center style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-0.5">
          <span className="rounded-full bg-ember px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#1a100c]">
            Selected
          </span>
          <span className="max-w-[140px] truncate rounded-md bg-black/75 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            {cand.label}
          </span>
        </div>
      </Html>
    </group>
  );
}

/** Instanced unselected candidates for performance. */
function CandidateCloud({
  items,
  dimFactor,
  activityIndex,
  onHover,
  onClick,
}: {
  items: GraphCandidate[];
  dimFactor: number;
  activityIndex: number;
  onHover: (c: GraphCandidate | null, e?: ThreeEvent<PointerEvent>) => void;
  onClick: (c: GraphCandidate) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const color = useMemo(() => new THREE.Color(), []);
  const temp = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!mesh.current) return;
    items.forEach((c, i) => {
      temp.position.set(...c.position);
      temp.scale.setScalar(0.09);
      temp.updateMatrix();
      mesh.current.setMatrixAt(i, temp.matrix);
      tempColor.set("#8a6a55").multiplyScalar(0.7);
      mesh.current.setColorAt(i, tempColor);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [items, temp, tempColor]);

  useFrame(({ clock }) => {
    if (!mesh.current || items.length === 0) return;
    const t = clock.elapsedTime;
    items.forEach((c, i) => {
      const evaluating = activityIndex >= 0 && i === activityIndex % items.length;
      const s = evaluating ? 0.16 + Math.sin(t * 8) * 0.04 : 0.09;
      temp.position.set(...c.position);
      temp.scale.setScalar(s);
      temp.updateMatrix();
      mesh.current.setMatrixAt(i, temp.matrix);
      if (evaluating) tempColor.set("#e8905a");
      else tempColor.setRGB(0.45 * dimFactor, 0.32 * dimFactor, 0.26 * dimFactor);
      mesh.current.setColorAt(i, tempColor);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, items.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id == null) return;
        onHover(items[id] ?? null, e);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id == null) return;
        const c = items[id];
        if (c) onClick(c);
      }}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.55 * dimFactor}
        roughness={0.8}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function LinkLines({
  points,
  color,
  opacity,
  dashed,
}: {
  points: [number, number, number][];
  color: string;
  opacity: number;
  dashed?: boolean;
}) {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color={color}
      lineWidth={dashed ? 0.6 : 1.4}
      transparent
      opacity={opacity}
      dashed={dashed}
      dashSize={0.25}
      gapSize={0.15}
    />
  );
}

function CameraRig({ focusPos }: { focusPos: [number, number, number] | null }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as any;
  useFrame(() => {
    if (!focusPos) return;
    const target = new THREE.Vector3(...focusPos);
    const desired = target.clone().add(new THREE.Vector3(4.5, 3.2, 6.5));
    camera.position.lerp(desired, 0.04);
    if (controls?.target) {
      controls.target.lerp(target, 0.06);
      controls.update?.();
    }
  });
  return null;
}

function SceneInner({
  data,
  filter,
  mode,
  focusId,
  onFocus,
  onSelectCandidate,
  selectedCandidate,
}: Props) {
  const [activityIndex, setActivityIndex] = useState(0);
  const [hover, setHover] = useState<GraphCandidate | null>(null);

  useEffect(() => {
    if (mode !== "activity") return;
    const id = window.setInterval(() => setActivityIndex((i) => i + 1), 420);
    return () => clearInterval(id);
  }, [mode]);

  const catVisible = (cat: GraphCategory) => {
    if (filter === "all") return true;
    if (filter === "selected") return data.candidates.some((c) => c.selected && c.parentId === cat.id);
    return cat.type === filter;
  };

  const unselected = useMemo(() => {
    return data.candidates.filter((c) => {
      if (c.selected) return false;
      if (filter === "selected") return false;
      if (filter === "all") return true;
      const cat = data.categories.find((x) => x.id === c.parentId);
      return cat?.type === filter;
    });
  }, [data, filter]);

  const selected = useMemo(() => {
    return data.candidates.filter((c) => {
      if (!c.selected) return false;
      if (filter === "all" || filter === "selected") return true;
      const cat = data.categories.find((x) => x.id === c.parentId);
      return cat?.type === filter;
    });
  }, [data, filter]);

  const focusPos = useMemo(() => {
    if (!focusId) return null;
    const n =
      data.categories.find((c) => c.id === focusId) ||
      data.subcategories.find((c) => c.id === focusId) ||
      data.candidates.find((c) => c.id === focusId);
    return n ? n.position : null;
  }, [focusId, data]);

  const itineraryPts = useMemo(() => {
    const itin = data.relationships.filter((r) => r.type === "itinerary");
    const byId = new Map(data.candidates.map((c) => [c.id, c]));
    const pts: [number, number, number][] = [];
    for (const r of itin) {
      const a = byId.get(r.source);
      const b = byId.get(r.target);
      if (!a || !b) continue;
      if (filter !== "all" && filter !== "selected") {
        const ca = data.categories.find((c) => c.id === a.parentId);
        if (ca?.type !== filter) continue;
      }
      if (pts.length === 0) pts.push(a.position);
      pts.push(b.position);
    }
    return pts;
  }, [data, filter]);

  const dimUnrelated = filter !== "all" && filter !== "selected";

  return (
    <>
      <color attach="background" args={["#070504"]} />
      <fog attach="fog" args={["#070504", 22, 55]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 8, 0]} intensity={1.2} color="#e8905a" distance={60} />
      <pointLight position={[-12, 4, 10]} intensity={0.5} color="#f4a261" distance={40} />
      <pointLight position={[10, -2, -8]} intensity={0.35} color="#8a5a3a" distance={40} />

      {/* faint starfield */}
      <Stars count={400} />

      {data.categories.map((cat) => {
        const vis = catVisible(cat);
        if (filter === "selected" && !vis) return null;
        return (
          <CategoryNode
            key={cat.id}
            cat={cat}
            dim={!vis || (dimUnrelated && cat.type !== filter)}
            onClick={() => onFocus(cat.id)}
          />
        );
      })}

      {filter !== "selected" &&
        data.subcategories.map((sub) => {
          const cat = data.categories.find((c) => c.id === sub.parentId)!;
          const vis = catVisible(cat);
          if (!vis && filter !== "all") return null;
          return (
            <SubcategoryNode
              key={sub.id}
              sub={sub}
              dim={dimUnrelated && cat.type !== filter}
              onClick={() => onFocus(sub.id)}
            />
          );
        })}

      {/* soft contains lines category→sub */}
      {filter !== "selected" &&
        data.relationships
          .filter((r) => r.type === "contains")
          .map((r) => {
            const a = data.categories.find((c) => c.id === r.source);
            const b = data.subcategories.find((c) => c.id === r.target);
            if (!a || !b) return null;
            if (filter !== "all" && a.type !== filter) return null;
            return (
              <LinkLines
                key={r.id}
                points={[a.position, b.position]}
                color="#5a3a28"
                opacity={0.22}
                dashed
              />
            );
          })}

      <CandidateCloud
        items={unselected}
        dimFactor={filter === "selected" ? 0 : 1}
        activityIndex={mode === "activity" ? activityIndex : -1}
        onHover={(c) => setHover(c)}
        onClick={(c) => {
          onSelectCandidate(c);
          onFocus(c.id);
        }}
      />

      {selected.map((c) => (
        <SelectedNode
          key={c.id}
          cand={c}
          active={selectedCandidate?.id === c.id || hover?.id === c.id}
          activityPulse={mode === "activity" ? 1 : 0}
          onHover={setHover}
          onClick={() => {
            onSelectCandidate(c);
            onFocus(c.id);
          }}
        />
      ))}

      {itineraryPts.length > 1 && (
        <LinkLines points={itineraryPts} color="#f4a261" opacity={0.9} />
      )}

      {/* selected → category stronger links */}
      {selected.map((c) => {
        const cat = data.categories.find((x) => x.id === c.parentId);
        if (!cat) return null;
        return (
          <LinkLines
            key={`sel-link-${c.id}`}
            points={[cat.position, c.position]}
            color="#e8905a"
            opacity={0.45}
          />
        );
      })}

      <CameraRig focusPos={focusPos} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={6}
        maxDistance={48}
        autoRotate={mode === "graph" && !focusId}
        autoRotateSpeed={0.25}
      />

      {(hover || selectedCandidate) && (
        <Html
          position={(hover ?? selectedCandidate)!.position}
          style={{ pointerEvents: "none", transform: "translate(24px, -40px)" }}
          zIndexRange={[100, 0]}
        >
          <CandidateCard cand={hover ?? selectedCandidate!} />
        </Html>
      )}
    </>
  );
}

function Stars({ count }: { count: number }) {
  const geom = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geom}>
      <pointsMaterial size={0.06} color="#c4a090" transparent opacity={0.45} sizeAttenuation />
    </points>
  );
}

function CandidateCard({ cand }: { cand: GraphCandidate }) {
  const m = cand.metadata;
  const match = m.match ?? cand.score;
  return (
    <div className="w-[240px] rounded-2xl border border-white/15 bg-[#120e0c]/92 p-3 text-white shadow-2xl backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ember">
        {cand.selected ? "Selected by WAYPORT" : "Considered"}
      </div>
      <div className="mt-1 font-display text-base leading-tight">{cand.label}</div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-text-tertiary">
          <span>Match</span>
          <span className="text-ember">{match}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-ember" style={{ width: `${match}%` }} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-text-secondary">
        <div className="flex justify-between gap-2">
          <dt>Location</dt>
          <dd>{m.locationScore ?? "—"}%</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Budget</dt>
          <dd>{m.budgetScore ?? "—"}%</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Prefs</dt>
          <dd>{m.prefsScore ?? "—"}%</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Avail</dt>
          <dd>{m.availabilityScore ?? "—"}%</dd>
        </div>
      </dl>
      <div className="mt-2 flex justify-between text-[10px] text-text-tertiary">
        <span>{m.priceUsd != null ? formatCurrency(m.priceUsd) : ""}</span>
        <span>{m.alternatives ?? 0} alternatives</span>
      </div>
      {cand.selected && m.reasonFactors && (
        <div className="mt-2 flex flex-wrap gap-1">
          {m.reasonFactors.map((f) => (
            <span key={f} className="rounded-full border border-ember/30 px-1.5 py-0.5 text-[9px] text-ember">
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DecisionGraphCanvas(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 8, 32], fov: 48, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
      onPointerMissed={() => {
        props.onSelectCandidate(null);
        props.onFocus(null);
      }}
    >
      <SceneInner {...props} />
    </Canvas>
  );
}
