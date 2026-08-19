"use client";

import { Suspense, Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, useGLTF, useProgress } from "@react-three/drei";
import type { Group } from "three";
import { MathUtils, Mesh, Vector3 } from "three";
import type { Character } from "@/lib/characters";

type Avatar3DStageProps = {
  character: Character;
  isSpeaking: boolean;
  spokenText?: string;
  // Updated continuously while speaking so VoiceWave can animate the external waveform.
  mouthLevelRef?: { current: number };
  // Optional glTF URL. If absent, we render a stylized fallback avatar.
  modelUrl?: string | null;
};

function normMorphName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function useVisemeSchedule(spokenText: string | undefined, enabled: boolean) {
  // Very lightweight viseme proxy:
  // - We scan vowels in the spokenText and map them to ARKit-like viseme buckets.
  // - Timing is approximate, but it gives organic jaw motion + vowel emphasis.
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
    // Convert tokens into segment weights.
    const segmentDurMs = 70; // approximate phoneme pace
    const segments = tokens.length
      ? tokens.map((t) => ({ t, durationMs: segmentDurMs }))
      : [{ t: "aa" as const, durationMs: 140 }];
    return { segments, segmentDurMs };
  }, [tokens]);
}

class AvatarGLTFErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError?: (error: unknown) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function FallbackAvatar({
  character,
  isSpeaking,
  spokenText,
  mouthLevelRef,
}: Omit<Avatar3DStageProps, "modelUrl">) {
  const groupRef = useRef<Group | null>(null);
  const leftEyeRef = useRef<Mesh | null>(null);
  const rightEyeRef = useRef<Mesh | null>(null);
  const mouthRef = useRef<Mesh | null>(null);

  const [blinkSeed] = useState(() => Math.random() * 1_000_000);
  const speakingStartedAtRef = useRef<number>(0);

  const { segments } = useVisemeSchedule(spokenText, isSpeaking);
  const durationMs = segments.reduce((acc, s) => acc + s.durationMs, 0);

  useEffect(() => {
    if (isSpeaking) speakingStartedAtRef.current = performance.now();
  }, [isSpeaking]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    // Idle floating / breathing.
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = Math.sin(t * 0.25 + blinkSeed * 0.00001) * 0.06;
    groupRef.current.position.y = Math.sin(t * 0.65) * 0.02;

    // Blink logic (random-ish every 3–5 seconds).
    const blinkPeriod = 3.4 + (blinkSeed % 1000) / 1000; // 3.4–4.4s
    const blinkPhase = (t * 1_000) % (blinkPeriod * 1_000);
    const inBlink = blinkPhase < 120; // ~120ms
    const blinkAmt = inBlink ? 1 : 0;

    const lerpBlink = (mesh: Mesh | null, target: number) => {
      if (!mesh) return;
      mesh.scale.y = MathUtils.lerp(mesh.scale.y, target, 0.14);
    };

    lerpBlink(leftEyeRef.current, 1 - blinkAmt * 0.72);
    lerpBlink(rightEyeRef.current, 1 - blinkAmt * 0.72);

    // Speaking → jawOpen-like envelope.
    let jaw = 0;
    if (isSpeaking) {
      const elapsedMs = Math.max(0, performance.now() - speakingStartedAtRef.current);
      const p = durationMs ? elapsedMs % durationMs : 0;
      let acc = 0;
      let active = segments[0]?.t ?? "aa";
      for (const seg of segments) {
        acc += seg.durationMs;
        if (p <= acc) {
          active = seg.t;
          break;
        }
      }

      const ampBase = 0.18 + 0.82 * Math.abs(Math.sin((elapsedMs / 1000) * 2.2));
      const vowelBoost =
        active === "aa" ? 1.0 : active === "e" ? 0.85 : active === "i" ? 0.8 : active === "o" ? 0.9 : 0.75;
      jaw = ampBase * vowelBoost;
      jaw = Math.min(1, Math.max(0, jaw));
    }

    if (mouthRef.current) {
      const targetScaleY = 0.35 + jaw * 0.95;
      mouthRef.current.scale.y = MathUtils.lerp(mouthRef.current.scale.y, targetScaleY, 0.16);
      mouthRef.current.position.y = MathUtils.lerp(mouthRef.current.position.y, 0.02 + jaw * 0.01, 0.16);
    }

    if (mouthLevelRef) mouthLevelRef.current = MathUtils.lerp(mouthLevelRef.current, jaw, 0.18);
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color={character.accentColor} emissive={character.accentColor} emissiveIntensity={0.22} />
      </mesh>

      {/* Eyes */}
      <mesh ref={leftEyeRef} position={[-0.16, 0.12, 0.52]} scale={[1, 1, 1]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#d9ffff" emissive="#47ffe6" emissiveIntensity={0.8} />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.16, 0.12, 0.52]} scale={[1, 1, 1]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#d9ffff" emissive="#47ffe6" emissiveIntensity={0.8} />
      </mesh>

      {/* Mouth */}
      <mesh ref={mouthRef} position={[0, -0.08, 0.55]} scale={[1, 0.45, 1]}>
        <boxGeometry args={[0.25, 0.16, 0.02]} />
        <meshStandardMaterial color="#07110a" emissive="#0af3ff" emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

function GLTFTalkingAvatar({
  modelUrl,
  isSpeaking,
  spokenText,
  mouthLevelRef,
}: {
  modelUrl: string;
  isSpeaking: boolean;
  spokenText?: string;
  mouthLevelRef?: { current: number };
}) {
  return (
    <GLTFTalkingAvatarInner
      modelUrl={modelUrl}
      isSpeaking={isSpeaking}
      spokenText={spokenText}
      mouthLevelRef={mouthLevelRef}
    />
  );
}

// Separate component so hooks are unconditional within this subtree.
function GLTFTalkingAvatarInner({
  modelUrl,
  isSpeaking,
  spokenText,
  mouthLevelRef,
}: {
  modelUrl: string;
  isSpeaking: boolean;
  spokenText?: string;
  mouthLevelRef?: { current: number };
}) {
  const { scene } = useGLTF(modelUrl);
  const { camera } = useThree();
  const groupRef = useRef<Group | null>(null);
  const headWorldPosRef = useRef(new Vector3());
  const jawMeshNodeRef = useRef<Mesh | null>(null);
  const jawMeshInitialPosRef = useRef<Vector3 | null>(null);

  const morphMapRef = useRef<
    | null
    | Record<
        string,
        {
          mesh: Mesh;
          index: number;
        }
      >
  >(null);

  useEffect(() => {
    if (!scene) return;
    const map: Record<string, { mesh: Mesh; index: number }> = {};

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const mesh = obj as Mesh;

      // Best-effort jaw mesh for cases where the GLB doesn't expose mouth morph targets.
      if (!jawMeshNodeRef.current && /teeth|jaw|mouth/i.test(mesh.name)) {
        jawMeshNodeRef.current = mesh;
        jawMeshInitialPosRef.current = mesh.position.clone();
      }

      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;
      if (!dict || !infl) return;

      const entries = Object.entries(dict);
      for (const [rawName, index] of entries) {
        const key = normMorphName(rawName);
        // Map common ARKit-style names.
        map[key] = { mesh, index };
      }
    });

    morphMapRef.current = map;
  }, [scene]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const map = morphMapRef.current;
    if (!map) return;

    // Gentle idle head tracking (toward camera) + realistic periodic blinks.
    const t = clock.getElapsedTime();
    if (!isSpeaking) {
      const headPos = groupRef.current.getWorldPosition(headWorldPosRef.current);
      const dir = camera.position.clone().sub(headPos).normalize();

      // Convert camera direction vector into small, friendly yaw/pitch.
      const yaw = Math.atan2(dir.x, dir.z); // left/right
      const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))); // up/down
      const targetYaw = Math.max(-0.55, Math.min(0.55, yaw)) * 0.22;
      const targetPitch = Math.max(-0.35, Math.min(0.35, pitch)) * -0.18;

      // Add a tiny breathing component so it never feels rigid.
      const breath = Math.sin(t * 0.6) * 0.004;

      groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, targetYaw + breath, 0.05);
      groupRef.current.rotation.x = MathUtils.lerp(groupRef.current.rotation.x, targetPitch, 0.05);
    } else {
      // Speaking keeps the head mostly stable to avoid jitter.
      groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, 0, 0.08);
      groupRef.current.rotation.x = MathUtils.lerp(groupRef.current.rotation.x, 0, 0.08);
    }

    const blinkPeriod = 4; // every ~4 seconds
    const blinkPhase = (t * 1000) % (blinkPeriod * 1000);
    const inBlink = blinkPhase < 120; // ~120ms blink
    const blinkAmt = inBlink ? 1 : 0;

    const blinkL = map.eyeblinkleft;
    const blinkR = map.eyeblinkright;

    if (blinkL) blinkL.mesh.morphTargetInfluences![blinkL.index] = MathUtils.lerp(
      blinkL.mesh.morphTargetInfluences![blinkL.index],
      blinkAmt * 1,
      0.18,
    );
    if (blinkR) blinkR.mesh.morphTargetInfluences![blinkR.index] = MathUtils.lerp(
      blinkR.mesh.morphTargetInfluences![blinkR.index],
      blinkAmt * 1,
      0.18,
    );

    // Helper to lerp influence by morph key.
    const lerpMorph = (key: string | null | undefined, value: number) => {
      if (!key) return;
      const hit = map[key];
      if (!hit) return;
      const arr = hit.mesh.morphTargetInfluences!;
      arr[hit.index] = MathUtils.lerp(arr[hit.index], value, 0.18);
    };

    const wave = isSpeaking ? Math.max(0, Math.min(1, Math.sin(t * 14) * 0.7 + 0.3)) : 0;

    // Check if the mesh exposes any of the mouth morph targets we want to drive.
    const hasAnyMouthMorph = Boolean(
      map["mouthopen"] ||
        map["jawopen"] ||
        map["visemeaa"] ||
        map["mouthsmile"] ||
        map["mouthfunnel"],
    );

    if (isSpeaking) {
      // Active lip-sync (mouth/jaw targets).
      lerpMorph("jawopen", wave);
      lerpMorph("mouthopen", wave);
      lerpMorph("visemeaa", wave);
      lerpMorph("mouthsmile", wave);
      lerpMorph("mouthfunnel", wave);

      // If morph targets are missing, move the jaw/teeth mesh node directly.
      if (!hasAnyMouthMorph && jawMeshNodeRef.current && jawMeshInitialPosRef.current) {
        jawMeshNodeRef.current.position.y = MathUtils.lerp(
          jawMeshNodeRef.current.position.y,
          jawMeshInitialPosRef.current.y + wave * 0.02,
          0.25,
        );
      }
    } else {
      // Idle: close mouth targets and reset jaw mesh.
      lerpMorph("jawopen", 0);
      lerpMorph("mouthopen", 0);
      lerpMorph("visemeaa", 0);
      lerpMorph("mouthsmile", 0);
      lerpMorph("mouthfunnel", 0);

      if (jawMeshNodeRef.current && jawMeshInitialPosRef.current) {
        jawMeshNodeRef.current.position.y = MathUtils.lerp(
          jawMeshNodeRef.current.position.y,
          jawMeshInitialPosRef.current.y,
          0.25,
        );
      }
    }

    if (mouthLevelRef) mouthLevelRef.current = MathUtils.lerp(mouthLevelRef.current, wave, 0.18);
  });

  return (
    <group ref={groupRef} position={[0, -1.35, 0]} scale={1.7}>
      <primitive object={scene} />
    </group>
  );
}

export function Avatar3DStage({ character, isSpeaking, spokenText, mouthLevelRef }: Avatar3DStageProps) {
  const fallbackModelUrl = "/models/alex.glb";
  const candidateCharacterId = character.id === "luna" ? "emma" : character.id;
  const candidateModelUrl = `/models/${candidateCharacterId}.glb`;
  const [modelUrlToUse, setModelUrlToUse] = useState<string>(fallbackModelUrl);

  // Universal local model resolution:
  // - Prefer /models/{characterId}.glb
  // - If missing, fall back to /models/alex.glb
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // If we already use the fallback, skip the probe.
      if (candidateModelUrl === fallbackModelUrl) {
        setModelUrlToUse(fallbackModelUrl);
        return;
      }

      try {
        const res = await fetch(candidateModelUrl, { method: "HEAD" });
        if (cancelled) return;
        setModelUrlToUse(res.ok ? candidateModelUrl : fallbackModelUrl);
      } catch {
        if (cancelled) return;
        setModelUrlToUse(fallbackModelUrl);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [candidateModelUrl]);

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

  return (
    <Canvas
      className="avatar-3d-canvas"
      dpr={[1, 2]}
      camera={{ position: [0, 0.15, 0.95], fov: 30 }}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      shadows={false}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={<ModelLoader />}>
        <ambientLight intensity={1.5} />
        <directionalLight intensity={2.0} position={[0, 5, 5]} />
        <pointLight intensity={1.2} position={[0, 2, 2]} />
        <Environment preset="city" />

        <AvatarGLTFErrorBoundary key={modelUrlToUse} fallback={null}>
          <GLTFTalkingAvatar
            modelUrl={modelUrlToUse}
            isSpeaking={isSpeaking}
            spokenText={spokenText}
            mouthLevelRef={mouthLevelRef}
          />
        </AvatarGLTFErrorBoundary>
      </Suspense>
    </Canvas>
  );
}

