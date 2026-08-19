"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { MathUtils, Mesh } from "three";
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
  const groupRef = useRef<Group | null>(null);

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

  const speakingStartedAtRef = useRef<number>(0);

  const { segments } = useVisemeSchedule(spokenText, isSpeaking);
  const durationMs = segments.reduce((acc, s) => acc + s.durationMs, 0);

  useEffect(() => {
    if (isSpeaking) speakingStartedAtRef.current = performance.now();
  }, [isSpeaking]);

  useEffect(() => {
    if (!scene) return;
    const map: Record<string, { mesh: Mesh; index: number }> = {};

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const mesh = obj as Mesh;
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

    // Blink (use time-based gating even without viseme text).
    const t = clock.getElapsedTime();
    const blinkPeriod = 3.4;
    const blinkPhase = (t * 1000) % (blinkPeriod * 1000);
    const inBlink = blinkPhase < 120;
    const blinkAmt = inBlink ? 1 : 0;

    const blinkL = map.eyeBlinkLeft ?? map.eyeblinkleft ?? map.eyeblinkleft;
    const blinkR = map.eyeBlinkRight ?? map.eyeblinkright ?? map.eyeblinkright;

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

    let jaw = 0;
    let aa = 0;
    let e = 0;
    let i = 0;
    let o = 0;
    let u = 0;

    if (isSpeaking) {
      const elapsedMs = Math.max(0, performance.now() - speakingStartedAtRef.current);
      const p = durationMs ? elapsedMs % durationMs : 0;
      let acc = 0;
      let active: "aa" | "e" | "i" | "o" | "u" = "aa";
      for (const seg of segments) {
        acc += seg.durationMs;
        if (p <= acc) {
          active = seg.t;
          break;
        }
      }

      const ampBase = 0.18 + 0.82 * Math.abs(Math.sin((elapsedMs / 1000) * 2.2));
      jaw = Math.min(1, ampBase);

      // Vowel emphasis.
      aa = active === "aa" ? 1 : 0;
      e = active === "e" ? 1 : 0;
      i = active === "i" ? 1 : 0;
      o = active === "o" ? 1 : 0;
      u = active === "u" ? 1 : 0;
    }

    // Helper to lerp influence by morph key.
    const lerpMorph = (key: string | null | undefined, value: number) => {
      if (!key) return;
      const hit = map[key];
      if (!hit) return;
      const arr = hit.mesh.morphTargetInfluences!;
      arr[hit.index] = MathUtils.lerp(arr[hit.index], value, 0.18);
    };

    // Jaw.
    lerpMorph("jawopen", jaw);
    lerpMorph("jaw", jaw);

    // Vowels / visemes (best-effort key matching).
    lerpMorph("visemeaa", aa * jaw);
    lerpMorph("viseme_e", e * jaw);
    lerpMorph("visemee", e * jaw);
    lerpMorph("visemei", i * jaw);
    lerpMorph("viseme_i", i * jaw);
    lerpMorph("visemeo", o * jaw);
    lerpMorph("viseme_o", o * jaw);
    lerpMorph("visemeu", u * jaw);
    lerpMorph("viseme_u", u * jaw);

    if (mouthLevelRef) mouthLevelRef.current = MathUtils.lerp(mouthLevelRef.current, jaw, 0.18);
  });

  return <primitive object={scene} ref={groupRef} />;
}

export function Avatar3DStage({ character, isSpeaking, spokenText, mouthLevelRef, modelUrl }: Avatar3DStageProps) {
  return (
    <Canvas
      className="avatar-3d-canvas"
      dpr={[1, 2]}
      camera={{ position: [0, 0.15, 2.2], fov: 22 }}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      shadows={false}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.25} />
        <directionalLight intensity={0.65} position={[1.4, 2.1, 1.6]} />
        <Environment preset="city" />

        {/* Render GLB avatar if URL is provided; else fallback procedural avatar */}
        {modelUrl ? (
          <GLTFTalkingAvatar modelUrl={modelUrl} isSpeaking={isSpeaking} spokenText={spokenText} mouthLevelRef={mouthLevelRef} />
        ) : (
          <FallbackAvatar character={character} isSpeaking={isSpeaking} spokenText={spokenText} mouthLevelRef={mouthLevelRef} />
        )}
      </Suspense>
    </Canvas>
  );
}

