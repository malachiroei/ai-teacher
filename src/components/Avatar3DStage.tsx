"use client";

import { Suspense, Component, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, useGLTF, useProgress } from "@react-three/drei";
import type { Group } from "three";
import { MathUtils, Mesh, Object3D, Vector3 } from "three";
import type { Character } from "@/lib/characters";

type Avatar3DStageProps = {
  character: Character;
  isSpeaking: boolean;
  spokenText?: string;
  mouthLevelRef?: { current: number };
  modelUrl?: string | null;
  compact?: boolean;
};

const MAX_MOUTH_OPEN = 0.35;

function normMorphName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type MouthMorphKind = "jaw" | "aa" | "smile" | "funnel" | "other";

function classifyMouthMorph(rawKey: string): MouthMorphKind {
  const key = normMorphName(rawKey);
  if (key.includes("jawopen") || key.includes("mouthopen") || key === "jaw" || key.includes("blendshapejaw")) {
    return "jaw";
  }
  if (key.includes("visemeaa") || key === "vaa") return "aa";
  if (key.includes("mouthsmile")) return "smile";
  if (key.includes("mouthfunnel") || key.includes("mouthpucker")) return "funnel";
  return "other";
}

function mouthTargetForKind(kind: MouthMorphKind, amount: number) {
  switch (kind) {
    case "jaw":
      return amount * 0.92;
    case "aa":
      return amount * 0.72;
    case "smile":
      return amount * 0.28;
    case "funnel":
      return amount * 0.16;
    default:
      return amount * 0.5;
  }
}

function useVisemeSchedule(spokenText: string | undefined, enabled: boolean) {
  const tokens = useMemo(() => {
    if (!spokenText) return [];
    const s = spokenText.toLowerCase();
    const out: Array<"aa" | "e" | "i" | "o" | "u"> = [];
    for (const ch of s) {
      if (ch === "a") out.push("aa");
      else if (ch === "e") out.push("e");
      else if (ch === "i" || ch === "y") out.push("i");
      else if (ch === "o") out.push("o");
      else if (ch === "u") out.push("u");
    }
    return out.slice(0, 70);
  }, [spokenText]);

  return useMemo(() => {
    const segmentDurMs = 70;
    const segments = tokens.length
      ? tokens.map((t) => ({ t, durationMs: segmentDurMs }))
      : [{ t: "aa" as const, durationMs: 140 }];
    return { segments, segmentDurMs };
  }, [tokens]);
}

function AvatarGLTFErrorBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function ModelLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="pointer-events-none flex flex-col items-center gap-2 rounded-2xl border border-cyan-400/20 bg-black/30 px-4 py-3 backdrop-blur-md">
        <div className="h-8 w-8 rounded-full border border-cyan-400/40 border-t-cyan-300/90 animate-spin" />
        <div className="text-xs font-semibold text-white/75">{Math.round(progress)}% loaded</div>
      </div>
    </Html>
  );
}

function resolveCharacterModelId(characterId: string) {
  return characterId === "alex" ? "alex" : "emma";
}

// Keep the heavy GLTF talking avatar implementation from the existing file by reading
// the rest of the original component logic via a partial rewrite of only the Canvas wrapper.
// The GLTFTalkingAvatar below is copied from the previous implementation (simplified logging).

function GLTFTalkingAvatar({
  characterId,
  modelUrl,
  isSpeaking,
  spokenText,
  mouthLevelRef,
}: {
  characterId: "emma" | "alex";
  modelUrl: string;
  isSpeaking: boolean;
  spokenText?: string;
  mouthLevelRef?: { current: number };
}) {
  const { scene } = useGLTF(modelUrl);
  const groupRef = useRef<Group>(null);
  const mouthInfluenceEntriesRef = useRef<Array<{ mesh: Mesh; index: number; kind: MouthMorphKind }>>([]);
  const eyeInfluenceEntriesRef = useRef<Array<{ mesh: Mesh; index: number }>>([]);
  const hasMouthMorphRef = useRef(false);
  const jawOrHeadNodeRef = useRef<Object3D | null>(null);
  const jawOrHeadInitialRotRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const jawMeshNodeRef = useRef<Object3D | null>(null);
  const jawMeshInitialPosRef = useRef<Vector3 | null>(null);
  const viseme = useVisemeSchedule(spokenText, isSpeaking);
  const speakStartedAtRef = useRef(0);

  useEffect(() => {
    mouthInfluenceEntriesRef.current = [];
    eyeInfluenceEntriesRef.current = [];
    hasMouthMorphRef.current = false;
    jawOrHeadNodeRef.current = null;
    jawOrHeadInitialRotRef.current = null;
    jawMeshNodeRef.current = null;
    jawMeshInitialPosRef.current = null;

    scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (dict && influences) {
        for (const [name, index] of Object.entries(dict)) {
          const kind = classifyMouthMorph(name);
          const key = normMorphName(name);
          if (kind !== "other" || key.includes("mouth") || key.includes("jaw") || key.includes("viseme")) {
            mouthInfluenceEntriesRef.current.push({ mesh, index: Number(index), kind });
            hasMouthMorphRef.current = true;
          }
          if (key.includes("eyeblink") || key.includes("blink")) {
            eyeInfluenceEntriesRef.current.push({ mesh, index: Number(index) });
          }
        }
      }
      const n = mesh.name.toLowerCase();
      if (!jawOrHeadNodeRef.current && (n.includes("jaw") || n.includes("head") || n.includes("face"))) {
        jawOrHeadNodeRef.current = mesh;
        jawOrHeadInitialRotRef.current = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
      }
      if (!jawMeshNodeRef.current && n.includes("jaw")) {
        jawMeshNodeRef.current = mesh;
        jawMeshInitialPosRef.current = mesh.position.clone();
      }
    });
  }, [scene]);

  useEffect(() => {
    if (isSpeaking) speakStartedAtRef.current = performance.now();
  }, [isSpeaking, spokenText]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let mouthAmount = 0;
    if (isSpeaking) {
      const elapsed = performance.now() - speakStartedAtRef.current;
      const { segments, segmentDurMs } = viseme;
      const cycle = Math.max(1, segments.length * segmentDurMs);
      const idx = Math.floor((elapsed % cycle) / segmentDurMs) % segments.length;
      const pulse = 0.18 + Math.sin(t * 14) * 0.18;
      mouthAmount = Math.min(MAX_MOUTH_OPEN, pulse + (idx % 2 === 0 ? 0.06 : 0));
    }

    for (const entry of eyeInfluenceEntriesRef.current) {
      const arr = entry.mesh.morphTargetInfluences;
      if (!arr) continue;
      const blinkPeriodSeconds = 3.5;
      const blinkPhase = t % blinkPeriodSeconds;
      const blinkAmt = blinkPhase < 0.12 ? 1 : 0;
      arr[entry.index] = MathUtils.lerp(arr[entry.index], blinkAmt, 0.3);
    }

    if (hasMouthMorphRef.current) {
      for (const entry of mouthInfluenceEntriesRef.current) {
        const arr = entry.mesh.morphTargetInfluences;
        if (!arr) continue;
        const target = mouthTargetForKind(entry.kind, mouthAmount);
        arr[entry.index] = MathUtils.lerp(arr[entry.index], target, 0.22);
      }
    } else {
      const node = jawOrHeadNodeRef.current;
      const initial = jawOrHeadInitialRotRef.current;
      if (node && initial) {
        const targetX = initial.x + (isSpeaking ? mouthAmount * 0.1 : 0);
        node.rotation.x = MathUtils.lerp(node.rotation.x, targetX, 0.22);
      }
      if (jawMeshNodeRef.current && jawMeshInitialPosRef.current) {
        const targetY = jawMeshInitialPosRef.current.y + (isSpeaking ? mouthAmount * 0.012 : 0);
        jawMeshNodeRef.current.position.y = MathUtils.lerp(jawMeshNodeRef.current.position.y, targetY, 0.22);
      }
    }

    if (mouthLevelRef) {
      mouthLevelRef.current = MathUtils.lerp(mouthLevelRef.current, isSpeaking ? mouthAmount : 0, 0.18);
    }
  });

  const modelPosition: [number, number, number] =
    characterId === "emma" ? [0, -2.6, 0] : [0, -2.85, 0];

  return (
    <group ref={groupRef}>
      <primitive object={scene} position={modelPosition} scale={1.7} rotation={[0, 0, 0]} />
    </group>
  );
}

export const Avatar3DStage = memo(function Avatar3DStage({
  character,
  isSpeaking,
  spokenText,
  mouthLevelRef,
  compact = false,
}: Avatar3DStageProps) {
  const characterId = resolveCharacterModelId(character.id) as "emma" | "alex";
  const modelUrl = `/models/${characterId}.glb`;
  const cameraPosition: [number, number, number] =
    characterId === "emma" ? [0, 0.42, 1.28] : [0, 0.4, 1.35];
  const [contextKey, setContextKey] = useState(0);
  const remountTimer = useRef<number | null>(null);

  const recoverContext = useCallback(() => {
    if (remountTimer.current != null) return;
    remountTimer.current = window.setTimeout(() => {
      remountTimer.current = null;
      setContextKey((key) => key + 1);
    }, 250);
  }, []);

  useEffect(() => {
    try {
      useGLTF.preload(modelUrl);
    } catch {
      /* preload is best-effort */
    }
  }, [modelUrl]);

  useEffect(() => {
    return () => {
      if (remountTimer.current != null) window.clearTimeout(remountTimer.current);
    };
  }, []);

  return (
    <Canvas
      key={`${characterId}-${contextKey}-${compact ? "c" : "f"}`}
      className="avatar-3d-canvas"
      dpr={compact ? 1 : [1, 1.5]}
      camera={{ position: cameraPosition, fov: compact ? 30 : 28 }}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      shadows={false}
      gl={{
        antialias: !compact,
        alpha: true,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
      }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        const onLost = (event: Event) => {
          event.preventDefault();
          console.warn("[Avatar3D] WebGL context lost — remounting");
          recoverContext();
        };
        const onRestored = () => {
          console.warn("[Avatar3D] WebGL context restored");
        };
        canvas.addEventListener("webglcontextlost", onLost, false);
        canvas.addEventListener("webglcontextrestored", onRestored, false);
      }}
    >
      <Suspense fallback={compact ? null : <ModelLoader />}>
        <ambientLight intensity={1.5} />
        <directionalLight intensity={2.0} position={[0, 5, 5]} />
        <pointLight intensity={1.2} position={[0, 2, 2]} />
        {!compact ? <Environment preset="city" /> : null}

        <AvatarGLTFErrorBoundary key={characterId} fallback={null}>
          <GLTFTalkingAvatar
            key={characterId}
            characterId={characterId}
            modelUrl={modelUrl}
            isSpeaking={isSpeaking}
            spokenText={spokenText}
            mouthLevelRef={mouthLevelRef}
          />
        </AvatarGLTFErrorBoundary>
      </Suspense>
    </Canvas>
  );
});
