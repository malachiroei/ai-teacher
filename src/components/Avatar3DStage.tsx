"use client";

import { Suspense, Component, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Group, Material } from "three";
import { Color, MathUtils, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3 } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHARACTERS, type Character } from "@/lib/characters";

type Avatar3DStageProps = {
  character: Character;
  isSpeaking?: boolean;
  spokenText?: string;
  isSpeakingRef?: { current: boolean };
  spokenTextRef?: { current: string };
  mouthLevelRef?: { current: number };
  modelUrl?: string | null;
  compact?: boolean;
};

const MAX_MOUTH_OPEN = 0.35;
const MALE_CHARACTER_IDS = new Set(["alex", "leo", "kai"]);

const AVATAR_LOOK: Record<string, { clothing: string; hair: string; hideGlasses?: boolean }> = {
  leo: { clothing: "#1d4ed8", hair: "#111827", hideGlasses: true },
  maya: { clothing: "#db2777", hair: "#3f1d12", hideGlasses: true },
  kai: { clothing: "#3f6212", hair: "#b45309", hideGlasses: true },
  chloe: { clothing: "#111827", hair: "#6b21a8", hideGlasses: true },
};

function applyAvatarLook(root: Object3D, characterId: string) {
  const look = AVATAR_LOOK[characterId];
  if (!look) return;
  const clothing = new Color(look.clothing);
  const hair = new Color(look.hair);
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const label = `${mesh.name} ${Array.isArray(mesh.material) ? mesh.material.map((item) => item?.name).join(" ") : mesh.material?.name ?? ""}`.toLowerCase();
    if (look.hideGlasses && (label.includes("glass") || label.includes("eyewear"))) {
      mesh.visible = false;
      return;
    }
    if (label.includes("head") || label.includes("eye") || label.includes("tooth") || label.includes("teeth") || label.includes("body") || label.includes("skin")) {
      return;
    }
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
    const nextMaterials = materials.map((material) => {
      const std = (material as MeshStandardMaterial).clone() as MeshStandardMaterial;
      if (!std.color) return std;
      if (label.includes("hair") || label.includes("scalp") || label.includes("brow")) {
        std.color.copy(hair);
        std.needsUpdate = true;
      } else if (
        label.includes("outfit") ||
        label.includes("shirt") ||
        label.includes("top") ||
        label.includes("bottom") ||
        label.includes("footwear") ||
        label.includes("cloth") ||
        label.includes("jacket") ||
        label.includes("hoodie") ||
        (label.includes("wolf3d") && !label.includes("hair"))
      ) {
        std.color.copy(clothing);
        std.needsUpdate = true;
      }
      return std;
    });
    mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
  });
}

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
  return characterId;
}

function isMaleAvatar(characterId: string) {
  return MALE_CHARACTER_IDS.has(characterId);
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
  isSpeakingRef,
  spokenTextRef,
  mouthLevelRef,
}: {
  characterId: string;
  modelUrl: string;
  isSpeakingRef?: { current: boolean };
  spokenTextRef?: { current: string };
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

    applyAvatarLook(avatarScene, characterId);

    if (isMaleAvatar(characterId)) {
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
    if (isSpeakingRef?.current) {
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
        // Soft welcoming smile at rest; open mouth while speaking.
        const idleSmile = entry.kind === "smile" && !isSpeakingRef?.current ? 0.22 + Math.sin(t * 1.1) * 0.04 : 0;
        const speakTarget = mouthTargetForKind(entry.kind, mouthAmount);
        const target = speakTarget + idleSmile;
        arr[entry.index] = MathUtils.lerp(arr[entry.index], target, 0.16);
      }
    } else {
      const node = jawOrHeadNodeRef.current;
      const initial = jawOrHeadInitialRotRef.current;
      if (node && initial) {
        const targetX = initial.x + (isSpeakingRef?.current ? mouthAmount * 0.1 : 0);
        node.rotation.x = MathUtils.lerp(node.rotation.x, targetX, 0.18);
      }
      if (jawMeshNodeRef.current && jawMeshInitialPosRef.current) {
        const targetY = jawMeshInitialPosRef.current.y + (isSpeakingRef?.current ? mouthAmount * 0.012 : 0);
        jawMeshNodeRef.current.position.y = MathUtils.lerp(jawMeshNodeRef.current.position.y, targetY, 0.18);
      }
    }

    // Gentle idle sway so the companion feels alive, not stiff.
    if (groupRef.current) {
      const breathe = Math.sin(t * 1.35) * 0.012;
      const sway = Math.sin(t * 0.7) * 0.018;
      groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, sway, 0.08);
      groupRef.current.position.y = MathUtils.lerp(groupRef.current.position.y, breathe, 0.1);
    }

    if (mouthLevelRef) {
      mouthLevelRef.current = MathUtils.lerp(mouthLevelRef.current, isSpeakingRef?.current ? mouthAmount : 0, 0.14);
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
  isSpeakingRef,
  spokenTextRef,
  mouthLevelRef,
  compact = false,
}: Avatar3DStageProps) {
  const characterId = resolveCharacterModelId(character.id);
  const modelUrl = character.modelUrl || `/models/${characterId}.glb`;
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
      for (const item of CHARACTERS) {
        if (item.modelUrl) useGLTF.preload(item.modelUrl);
      }
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
        <ambientLight intensity={1.55} />
        <hemisphereLight args={["#dbeafe", "#1e293b", 0.85]} />
        <directionalLight intensity={1.85} position={[0.15, 2.8, 5.2]} color="#ffffff" />
        <directionalLight intensity={0.55} position={[-2.2, 1.4, 2.4]} color="#93c5fd" />
        <pointLight intensity={1.15} distance={8} position={[0, 1.1, 3.2]} color="#e0f2fe" />

        <AvatarGLTFErrorBoundary key={characterId} fallback={null}>
          <GLTFTalkingAvatar
            key={characterId}
            characterId={characterId}
            modelUrl={modelUrl}
            isSpeakingRef={isSpeakingRef}
            spokenTextRef={spokenTextRef}
            mouthLevelRef={mouthLevelRef}
          />
        </AvatarGLTFErrorBoundary>
      </Suspense>
    </Canvas>
  );
}, (prev, next) => (
  prev.character.id === next.character.id &&
  prev.character.modelUrl === next.character.modelUrl &&
  prev.compact === next.compact &&
  prev.mouthLevelRef === next.mouthLevelRef &&
  prev.isSpeakingRef === next.isSpeakingRef &&
  prev.spokenTextRef === next.spokenTextRef
));
