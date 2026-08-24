"use client";

import { Suspense, Component, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Group, Material } from "three";
import { MathUtils, Mesh, Object3D, SkinnedMesh, Vector3 } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
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
const ALEX_MODEL_URL = "/models/alex.glb?v=human_male_v2";
const EMMA_MODEL_URL = "/models/emma.glb?v=v_final_new";

function setMaterialHighp(mesh: Mesh) {
  const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean) as Material[];
  for (const material of materials) {
    material.precision = "highp";
    material.depthWrite = true;
    material.needsUpdate = true;
  }
}

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

function resolveCharacterModelId(characterId: string) {
  return characterId === "alex" ? "alex" : "emma";
}

/** Clone GPU-owned geo/materials so cleanup can dispose them without nuking the GLTF cache. */
function cloneAvatarScene(source: Object3D) {
  const clone = SkeletonUtils.clone(source);
  clone.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) mesh.geometry = mesh.geometry.clone();
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  });
  return clone;
}

function disposeAvatarScene(root: Object3D) {
  root.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      material.dispose();
    }
  });
  root.clear();
}

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
  const avatarScene = useMemo(() => cloneAvatarScene(scene), [scene]);
  const groupRef = useRef<Group>(null);
  const mouthInfluenceEntriesRef = useRef<Array<{ mesh: Mesh; index: number; kind: MouthMorphKind }>>([]);
  const eyeInfluenceEntriesRef = useRef<Array<{ mesh: Mesh; index: number }>>([]);
  const hasMouthMorphRef = useRef(false);
  const jawOrHeadNodeRef = useRef<Object3D | null>(null);
  const jawOrHeadInitialRotRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const jawMeshNodeRef = useRef<Object3D | null>(null);
  const jawMeshInitialPosRef = useRef<Vector3 | null>(null);

  useEffect(() => {
    mouthInfluenceEntriesRef.current = [];
    eyeInfluenceEntriesRef.current = [];
    hasMouthMorphRef.current = false;
    jawOrHeadNodeRef.current = null;
    jawOrHeadInitialRotRef.current = null;
    jawMeshNodeRef.current = null;
    jawMeshInitialPosRef.current = null;

    avatarScene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      setMaterialHighp(mesh);
      const skinned = obj as SkinnedMesh;
      if (skinned.isSkinnedMesh && skinned.skeleton) {
        skinned.frustumCulled = false;
      }
      mesh.frustumCulled = skinned.isSkinnedMesh ? false : true;
      if (mesh.name.toLowerCase().includes("transparent")) mesh.visible = false;
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (dict && influences) {
        for (let i = 0; i < influences.length; i += 1) {
          influences[i] = 0;
        }
        for (const [name, index] of Object.entries(dict)) {
          const kind = classifyMouthMorph(name);
          const key = normMorphName(name);
          if (key.includes("visemesil") || key === "vsil") continue;
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

    if (characterId === "alex") {
      avatarScene.position.set(0, -1.25, 0);
      avatarScene.scale.setScalar(1.7);
    } else {
      avatarScene.position.set(0, -2.85, 0);
      avatarScene.scale.setScalar(1.7);
    }

    return () => {
      mouthInfluenceEntriesRef.current = [];
      eyeInfluenceEntriesRef.current = [];
      disposeAvatarScene(avatarScene);
    };
  }, [characterId, avatarScene]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let mouthAmount = 0;
    if (isSpeaking) {
      const pulse = 0.14 + Math.sin(t * 10) * 0.1 + Math.sin(t * 17) * 0.05;
      mouthAmount = Math.min(MAX_MOUTH_OPEN, Math.max(0.06, pulse));
    }

    for (const entry of eyeInfluenceEntriesRef.current) {
      const arr = entry.mesh.morphTargetInfluences;
      if (!arr) continue;
      const blinkPeriodSeconds = 4.2;
      const blinkPhase = t % blinkPeriodSeconds;
      const blinkAmt = blinkPhase < 0.1 ? Math.sin((blinkPhase / 0.1) * Math.PI) * 0.85 : 0;
      arr[entry.index] = MathUtils.lerp(arr[entry.index], blinkAmt, 0.35);
    }

    if (hasMouthMorphRef.current) {
      for (const entry of mouthInfluenceEntriesRef.current) {
        const arr = entry.mesh.morphTargetInfluences;
        if (!arr) continue;
        const target = mouthTargetForKind(entry.kind, mouthAmount);
        arr[entry.index] = MathUtils.lerp(arr[entry.index], target, 0.18);
      }
    } else {
      const node = jawOrHeadNodeRef.current;
      const initial = jawOrHeadInitialRotRef.current;
      if (node && initial) {
        const targetX = initial.x + (isSpeaking ? mouthAmount * 0.1 : 0);
        node.rotation.x = MathUtils.lerp(node.rotation.x, targetX, 0.18);
      }
      if (jawMeshNodeRef.current && jawMeshInitialPosRef.current) {
        const targetY = jawMeshInitialPosRef.current.y + (isSpeaking ? mouthAmount * 0.012 : 0);
        jawMeshNodeRef.current.position.y = MathUtils.lerp(jawMeshNodeRef.current.position.y, targetY, 0.18);
      }
    }

    if (mouthLevelRef) {
      mouthLevelRef.current = MathUtils.lerp(mouthLevelRef.current, isSpeaking ? mouthAmount : 0, 0.14);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={avatarScene} />
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
  const modelUrl = characterId === "alex" ? ALEX_MODEL_URL : EMMA_MODEL_URL;
  const cameraPosition: [number, number, number] = [0, 0.1, 1.2];
  const [contextKey, setContextKey] = useState(0);
  const remountTimer = useRef<number | null>(null);

  const recoverContext = useCallback(() => {
    if (remountTimer.current != null) return;
    remountTimer.current = window.setTimeout(() => {
      remountTimer.current = null;
      setContextKey((key) => key + 1);
    }, 1800);
  }, []);

  useEffect(() => {
    try {
      useGLTF.preload(EMMA_MODEL_URL);
      useGLTF.preload(ALEX_MODEL_URL);
    } catch {
      /* preload is best-effort */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (remountTimer.current != null) window.clearTimeout(remountTimer.current);
    };
  }, []);

  return (
    <Canvas
      key={`stage-${contextKey}`}
      className="avatar-3d-canvas"
      dpr={[1, 1]}
      frameloop="always"
      camera={{ position: cameraPosition, fov: 45 }}
      style={{ width: "100%", height: "100%", pointerEvents: "none", background: "transparent" }}
      shadows={false}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        precision: "highp",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        const onLost = (event: Event) => {
          event.preventDefault();
          console.warn("[Avatar3D] WebGL context lost — remounting once");
          recoverContext();
        };
        canvas.addEventListener("webglcontextlost", onLost, false);
      }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={1.28} />
        <directionalLight intensity={1.45} position={[0.4, 4.2, 4.6]} />

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
}, (prev, next) => (
  prev.character.id === next.character.id &&
  prev.isSpeaking === next.isSpeaking &&
  prev.compact === next.compact &&
  prev.mouthLevelRef === next.mouthLevelRef
));
