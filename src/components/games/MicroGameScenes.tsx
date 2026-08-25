"use client";

import type { ReactNode } from "react";
import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { Color, MathUtils } from "three";
import type { FillMissingData, ListenPickData, PictureMatchData } from "@/lib/chat-games";
import { fillPatternParts } from "@/lib/chat-games";
import { playGameSfx, playTryAgainSound } from "@/hooks/useNotifications";

const BALLOON_COLORS = ["#22d3ee", "#f472b6", "#fbbf24", "#4ade80"];

export function MiniGameCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-[220px] w-full overflow-hidden rounded-3xl">
      <Canvas
        camera={{ position: [0, 0.15, 5.2], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        onPointerMissed={() => undefined}
      >
        <color attach="background" args={["#041018"]} />
        <ambientLight intensity={0.55} />
        <pointLight position={[3, 4, 6]} intensity={28} color="#7dd3fc" distance={18} />
        <pointLight position={[-4, -1, 3]} intensity={16} color="#f0abfc" distance={14} />
        <spotLight position={[0, 6, 4]} angle={0.5} intensity={18} color="#fff7ed" />
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
}

function Burst({ origin }: { origin: [number, number, number] }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        dir: [
          Math.cos((index / 16) * Math.PI * 2) * (0.6 + (index % 3) * 0.2),
          Math.sin((index / 16) * Math.PI * 2) * 0.7 + 0.35,
          (index % 2 === 0 ? 0.2 : -0.15),
        ] as [number, number, number],
        color: BALLOON_COLORS[index % BALLOON_COLORS.length],
      })),
    [],
  );
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const bit = bits[index];
      child.position.x += bit.dir[0] * delta * 2.4;
      child.position.y += bit.dir[1] * delta * 2.4;
      child.position.z += bit.dir[2] * delta * 2.4;
      child.scale.multiplyScalar(0.96);
    });
  });
  return (
    <group ref={group} position={origin}>
      {bits.map((bit, index) => (
        <mesh key={index}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial emissive={bit.color} emissiveIntensity={2} color={bit.color} />
        </mesh>
      ))}
    </group>
  );
}

function Balloon({
  label,
  emoji,
  color,
  x,
  disabled,
  popped,
  onPop,
}: {
  label: string;
  emoji: string;
  color: string;
  x: number;
  disabled?: boolean;
  popped?: boolean;
  onPop: () => void;
}) {
  const mesh = useRef<Mesh>(null);
  const phase = useMemo(() => x * 1.7, [x]);
  useFrame((state) => {
    if (!mesh.current || popped) return;
    mesh.current.position.y = Math.sin(state.clock.elapsedTime * 1.4 + phase) * 0.22;
    mesh.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6 + phase) * 0.18;
  });
  if (popped) return <Burst origin={[x, 0, 0]} />;
  return (
    <group position={[x, 0, 0]}>
      <mesh
        ref={mesh}
        castShadow
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onPop();
        }}
        onPointerOver={() => {
          document.body.style.cursor = disabled ? "default" : "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.58, 32, 32]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.12}
          metalness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.12}
          transmission={0.18}
          thickness={0.6}
          emissive={new Color(color)}
          emissiveIntensity={disabled ? 0.05 : 0.35}
          transparent
          opacity={disabled ? 0.35 : 0.92}
        />
      </mesh>
      <Html center position={[0, 0.02, 0.6]} distanceFactor={7} style={{ pointerEvents: "none" }}>
        <div className="w-24 text-center text-[13px] font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]">
          <div className="text-lg">{emoji}</div>
          {label}
        </div>
      </Html>
    </group>
  );
}

export function BalloonBlastScene({
  data,
  disabled,
  wrong,
  won,
  onPick,
}: {
  data: PictureMatchData | ListenPickData;
  disabled?: boolean;
  wrong: string[];
  won?: boolean;
  onPick: (choice: string) => void;
}) {
  const options =
    "options" in data && Array.isArray(data.options) && typeof data.options[0] === "object"
      ? (data as ListenPickData).options
      : (data as PictureMatchData).options.map((label) => ({
          label,
          emoji: (data as PictureMatchData).emoji,
        }));
  const span = Math.min(3.6, options.length * 1.2);
  return (
    <>
      {options.map((item, index) => {
        const x = -span / 2 + (span / Math.max(1, options.length - 1)) * index;
        const popped = Boolean(won && item.label.toLowerCase() === String(data.answer).toLowerCase());
        return (
          <Balloon
            key={item.label}
            label={item.label}
            emoji={item.emoji}
            color={BALLOON_COLORS[index % BALLOON_COLORS.length]}
            x={options.length === 1 ? 0 : x}
            disabled={disabled || wrong.includes(item.label)}
            popped={popped}
            onPop={() => onPick(item.label)}
          />
        );
      })}
    </>
  );
}

function TreasureItem({ kind }: { kind: string }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 1.1;
  });
  const key = kind.toLowerCase();
  return (
    <group ref={ref} position={[0, 0.55, 0]}>
      {key.includes("pizza") ? (
        <mesh rotation={[-0.5, 0.2, 0.1]}>
          <cylinderGeometry args={[0.55, 0.55, 0.12, 22]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
      ) : key.includes("rocket") ? (
        <mesh>
          <coneGeometry args={[0.28, 0.9, 16]} />
          <meshStandardMaterial color="#38bdf8" metalness={0.4} roughness={0.25} emissive="#0ea5e9" emissiveIntensity={0.4} />
        </mesh>
      ) : key.includes("planet") || key.includes("sun") ? (
        <mesh>
          <sphereGeometry args={[0.42, 28, 28]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
        </mesh>
      ) : (
        <mesh>
          <icosahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color="#a78bfa" metalness={0.55} roughness={0.2} emissive="#7c3aed" emissiveIntensity={0.45} />
        </mesh>
      )}
    </group>
  );
}

export function VoiceChestScene({
  data,
  listening,
  level,
  unlocked,
}: {
  data: ListenPickData;
  listening?: boolean;
  level?: number;
  unlocked?: boolean;
}) {
  const lid = useRef<Group>(null);
  const glow = useRef<Mesh>(null);
  useFrame((state) => {
    if (lid.current) {
      const open = unlocked ? -1.15 : -0.18;
      lid.current.rotation.x = MathUtils.lerp(lid.current.rotation.x, open, 0.08);
    }
    if (glow.current) {
      const pulse = listening ? 0.35 + (level ?? 0) * 0.9 : unlocked ? 0.8 : 0.12;
      glow.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.04 + pulse * 0.15);
    }
  });
  return (
    <group position={[0, -0.55, 0]}>
      <mesh position={[0, 0.12, 0]} ref={glow}>
        <cylinderGeometry args={[0.95, 1.05, 0.18, 32]} />
        <meshStandardMaterial color="#1e293b" emissive={unlocked ? "#fde68a" : "#22d3ee"} emissiveIntensity={unlocked ? 1.4 : 0.35} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.15, 0.55, 0.8]} />
        <meshStandardMaterial color="#7c3aed" metalness={0.45} roughness={0.28} />
      </mesh>
      <group ref={lid} position={[0, 0.7, -0.22]}>
        <mesh position={[0, 0.18, 0.22]}>
          <boxGeometry args={[1.18, 0.18, 0.84]} />
          <meshStandardMaterial color="#c4b5fd" metalness={0.5} roughness={0.22} />
        </mesh>
      </group>
      <TreasureItem kind={`${data.speak} ${data.answer}`} />
      {unlocked ? <Burst origin={[0, 1.1, 0]} /> : null}
    </group>
  );
}

function LetterCube({
  letter,
  home,
  locked,
  rejected,
  onDrop,
}: {
  letter: string;
  home: [number, number, number];
  locked?: boolean;
  rejected?: boolean;
  onDrop: (letter: string, point: { x: number; y: number }) => void;
}) {
  const mesh = useRef<Mesh>(null);
  const dragging = useRef(false);
  useFrame((state) => {
    if (!mesh.current || dragging.current || locked) return;
    mesh.current.position.y = home[1] + Math.sin(state.clock.elapsedTime * 2 + home[0]) * 0.08;
    if (rejected) mesh.current.rotation.z = Math.sin(state.clock.elapsedTime * 18) * 0.12;
  });
  function moveTo(event: ThreeEvent<PointerEvent>) {
    if (!mesh.current || locked) return;
    mesh.current.position.x = event.point.x;
    mesh.current.position.y = event.point.y;
    mesh.current.position.z = 0.35;
  }
  return (
    <mesh
      ref={mesh}
      position={home}
      castShadow
      onPointerDown={(event) => {
        if (locked) return;
        event.stopPropagation();
        dragging.current = true;
        try {
          (event.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId);
        } catch {
          /* mesh targets may not support capture */
        }
        moveTo(event);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        event.stopPropagation();
        moveTo(event);
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        onDrop(letter, event.point);
      }}
    >
      <boxGeometry args={[0.62, 0.62, 0.62]} />
      <meshStandardMaterial
        color={locked ? "#86efac" : rejected ? "#fda4af" : "#f4d19b"}
        roughness={0.35}
        metalness={0.18}
        emissive={locked ? "#22c55e" : "#000000"}
        emissiveIntensity={locked ? 0.4 : 0}
      />
      <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <span className="text-xl font-black text-slate-900">{letter}</span>
      </Html>
    </mesh>
  );
}

export function LetterLaunchScene({
  data,
  lockedLetter,
  onDropLetter,
}: {
  data: FillMissingData;
  lockedLetter?: string;
  onDropLetter: (letter: string, hitSlot: boolean) => void;
}) {
  const parts = fillPatternParts(data.pattern);
  const homes = data.options.map((letter, index) => {
    const span = Math.min(3.4, data.options.length * 0.9);
    const x = data.options.length === 1 ? 0 : -span / 2 + (span / (data.options.length - 1)) * index;
    return [x, 0.85, 0] as [number, number, number];
  });
  const [rejected, setRejected] = useState<string | null>(null);
  return (
    <>
      <mesh
        position={[0, -0.85, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={() => undefined}
      >
        <planeGeometry args={[8, 6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[1.15, 0.22, 0.7]} />
        <meshStandardMaterial color="#0f172a" emissive="#22d3ee" emissiveIntensity={0.55} />
      </mesh>
      <Html center position={[0, -1.05, 0]} distanceFactor={8} style={{ pointerEvents: "none" }}>
        <p className="font-mono text-lg tracking-[0.28em] text-cyan-100">{parts.join(" ")}</p>
      </Html>
      {data.options.map((letter, index) => (
        <LetterCube
          key={`${letter}-${index}`}
          letter={letter}
          home={homes[index]}
          locked={lockedLetter === letter}
          rejected={rejected === letter}
          onDrop={(picked, point) => {
            const hit = Math.abs(point.x) < 0.7 && point.y < 0.05;
            if (!hit) {
              void playGameSfx("bounce");
              return;
            }
            const correct = picked.toLowerCase() === data.answer.toLowerCase();
            if (!correct) {
              setRejected(picked);
              void playTryAgainSound();
              window.setTimeout(() => setRejected(null), 420);
              onDropLetter(picked, true);
              return;
            }
            void playGameSfx("lock");
            onDropLetter(picked, true);
          }}
        />
      ))}
    </>
  );
}
