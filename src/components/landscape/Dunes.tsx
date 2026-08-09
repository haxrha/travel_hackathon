"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function makeNoiseDisplacement(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    data[i] = Math.floor(Math.random() * 255);
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  return tex;
}

function TerrainMesh() {
  const mesh = useRef<THREE.Mesh>(null!);
  const displacementMap = useRef<THREE.DataTexture | null>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (mesh.current) {
      mesh.current.rotation.y = Math.sin(t * 0.05) * 0.15;
    }
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2.3, 0, 0]} position={[0, -1.1, 0]}>
      <planeGeometry args={[40, 40, 80, 80]} />
      <meshStandardMaterial
        color="#241a13"
        displacementMap={displacementMap.current ?? (displacementMap.current = makeNoiseDisplacement())}
        displacementScale={2.4}
        metalness={0.05}
        roughness={0.95}
      />
    </mesh>
  );
}

/**
 * Atmospheric 3D ground: rolling dunes/hills under the product mockup.
 * Subtle idle sway keeps the scene alive without stealing focus.
 */
export function Dunes() {
  return (
    <div className="absolute inset-0 -z-10 opacity-60">
      <Canvas
        camera={{ position: [0, 1.6, 6.5], fov: 52 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={["#060a14", 6, 18]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 4]} intensity={0.6} color="#e8905a" />
        <directionalLight position={[-4, 4, -4]} intensity={0.4} color="#b9a6ff" />
        <TerrainMesh />
        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
      </Canvas>
    </div>
  );
}
