import { useEffect, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, CapsuleGeometry, Group, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EventProjection, Player } from "../competition";
import type { Anchors } from "./Scene";
import { AvatarMotion } from "./avatar-motion";
import type { AvatarResults } from "./avatar-results";
import type { Point, WorldLayout } from "./world";

const skins = ["#d99b77", "#f4c7a1", "#b97a56", "#e2ad88", "#eac7a5", "#ca9274", "#f4d2b3"];
const hairs = ["#34302a", "#60422b", "#252b31", "#846045", "#383331", "#5b4436", "#c4955a"];
const headGeometry = new SphereGeometry(0.24, 12, 10);
const hairGeometry = new SphereGeometry(0.249, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
const torsoGeometry = new CapsuleGeometry(0.215, 0.3, 3, 8);
const armGeometry = new CapsuleGeometry(0.068, 0.28, 2, 6).translate(0, -0.14, 0);
const legGeometry = new CapsuleGeometry(0.078, 0.24, 2, 6).translate(0, -0.14, 0);
const eyesGeometry = mergeGeometries([-1, 1].map(side => new BoxGeometry(0.04, 0.045, 0.035).translate(side * 0.085, 0.02, 0.225)));
class AvatarAmbient {
  private started = -Infinity;
  pulse() { this.started = performance.now(); }
  elapsed() { return (performance.now() - this.started) / 1000; }
}

// A shared, infrequent bout lets the entire demand-rendered scene sleep in
// between. Each player has different timing/amplitude, not a perpetual sway.
export function useAvatarAmbient(): AvatarAmbient {
  const [ambient] = useState(() => new AvatarAmbient());
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const pulse = () => { if (!document.hidden && !media.matches) { ambient.pulse(); invalidate(); } };
    const timer = window.setInterval(pulse, 14000);
    pulse();
    return () => clearInterval(timer);
  }, [ambient, invalidate]);
  return ambient;
}

export function Avatar({ player, index, position, selected, muted, onCourt, status, anchors, begin, layout, context, facing, results, ambient }: {
  player: Player; index: number; position: Point; selected: boolean; muted: boolean; onCourt: boolean;
  status: EventProjection["playerStates"][string]["status"]; anchors: Anchors;
  begin: (playerId: string, event: PointerEvent) => void;
  layout: WorldLayout; context: string; facing: number; results: AvatarResults; ambient: AvatarAmbient;
}) {
  const root = useRef<Group>(null), body = useRef<Group>(null), head = useRef<Group>(null);
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null), leftLeg = useRef<Group>(null), rightLeg = useRef<Group>(null);
  const invalidate = useThree(s => s.invalidate);
  const [initial] = useState(position);
  const [motion] = useState(() => new AvatarMotion(position, facing, context));
  const animation = useRef({ selected: 0, result: 0, resultKind: "acknowledge", resultToken: 0, reduced: false });
  const [x, y, z] = position;
  useEffect(() => {
    motion.retarget([x, y, z], facing, layout, context, animation.current.reduced);
    animation.current.result = 0;
    invalidate();
  }, [motion, x, y, z, facing, layout, context, invalidate]);
  useEffect(() => { animation.current.selected = selected && !animation.current.reduced ? 0.5 : 0; invalidate(); }, [selected, invalidate]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const reset = () => {
      animation.current.reduced = media.matches;
      motion.snap();
      animation.current.result = 0; animation.current.selected = 0;
      animation.current.resultToken = results.get(player.id)?.token ?? 0;
      invalidate();
    };
    reset();
    document.addEventListener("visibilitychange", reset); media.addEventListener("change", reset);
    return () => { document.removeEventListener("visibilitychange", reset); media.removeEventListener("change", reset); };
  }, [motion, invalidate, results, player.id]);
  useFrame((_, delta) => {
    if (!root.current || !body.current || !head.current || !leftArm.current || !rightArm.current || !leftLeg.current || !rightLeg.current) return;
    const a = animation.current, dt = Math.min(delta, 0.05);
    const reaction = results.get(player.id);
    if (reaction && reaction.token !== a.resultToken) { a.resultToken = reaction.token; a.result = a.reduced || document.hidden ? 0 : 1.35; a.resultKind = reaction.kind; }
    const oldDistance = motion.travelled;
    const moving = motion.step(dt, a.reduced || document.hidden);
    const walking = motion.walking && motion.travelled > oldDistance;
    const phase = motion.travelled * 7.2;
    const idleTime = ambient.elapsed() - (index % 7) * 0.12;
    const idle = !a.reduced && !document.hidden && idleTime >= 0 && idleTime < 2.3;
    const breath = idle ? Math.sin(idleTime / 2.3 * Math.PI) : 0;
    a.selected = Math.max(0, a.selected - dt); a.result = Math.max(0, a.result - dt);
    const selection = a.reduced ? 0 : Math.sin(a.selected / 0.5 * Math.PI);
    const cheer = a.result > 0 ? Math.sin(Math.min(1, a.result / 0.28) * Math.PI / 2) : 0;
    root.current.position.set(...motion.position);
    body.current.rotation.y = motion.yaw;
    body.current.position.y = walking ? Math.abs(Math.sin(phase)) * 0.035 : breath * 0.012;
    body.current.rotation.z = walking ? Math.sin(phase) * 0.025 : breath * (index % 2 ? 0.014 : -0.014);
    head.current.rotation.x = -selection * 0.12 + (a.resultKind === "acknowledge" ? cheer * 0.18 : 0);
    head.current.rotation.y = idle ? Math.sin(idleTime * 2 + index) * breath * 0.12 : 0;
    const stride = walking ? Math.sin(phase) * 0.5 : 0;
    leftLeg.current.rotation.x = stride; rightLeg.current.rotation.x = -stride;
    leftArm.current.rotation.x = -stride * 0.7;
    rightArm.current.rotation.x = stride * 0.7 - selection * 0.45 - (status === "playing" ? 0.2 : 0);
    leftArm.current.rotation.z = -0.12 - (a.resultKind === "celebrate" ? cheer * 2.2 : 0);
    rightArm.current.rotation.z = 0.12 + selection * 0.4 + (a.resultKind === "celebrate" ? cheer * 2.2 : 0);
    leftLeg.current.position.x = status === "playing" ? -0.16 : -0.12;
    rightLeg.current.position.x = status === "playing" ? 0.16 : 0.12;
    if (!document.hidden && (moving || idleTime < 2.3 && idleTime >= -0.72 && !a.reduced || a.selected > 0 || a.result > 0)) invalidate();
  });
  const shirt = player.teamId === "WHITE" ? muted ? "#d8dac6" : "#fff8de" : muted ? "#546751" : "#233d33";
  const trousers = player.teamId === "WHITE" ? "#8f9b7c" : "#1e302a";
  const ringColor = selected ? "#e4fc86" : status === "playing" ? "#84ded0" : status === "played_this_round" ? "#c8a86a" : "#e6cb85";
  return <group ref={root} position={initial} scale={1.55} userData={{ playerId: player.id }} onPointerDown={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); begin(player.id, event.nativeEvent); }}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><circleGeometry args={[0.34, 20]} /><meshBasicMaterial color="#435740" transparent opacity={0.13} depthWrite={false} /></mesh>
    {(selected || status !== "available") && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}><ringGeometry args={[selected ? 0.38 : 0.35, selected ? 0.49 : 0.39, 24]} /><meshBasicMaterial color={ringColor} transparent opacity={muted && !selected ? 0.55 : 0.95} /></mesh>}
    <group ref={body} rotation={[0, facing, 0]} dispose={null}>
      <mesh geometry={torsoGeometry} position={[0, 0.68, 0]}><meshStandardMaterial color={shirt} roughness={0.9} /></mesh>
      <group ref={leftArm} position={[-0.28, 0.84, 0]} rotation={[0, 0, -0.12]}><mesh geometry={armGeometry}><meshStandardMaterial color={shirt} roughness={0.9} /></mesh></group>
      <group ref={rightArm} position={[0.28, 0.84, 0]} rotation={[0, 0, 0.12]}>
        <mesh geometry={armGeometry}><meshStandardMaterial color={shirt} roughness={0.9} /></mesh>
        {(status === "playing" || status === "reserved") && <mesh position={[0.02, -0.38, 0.14]} rotation={[Math.PI / 2, 0, -0.18]} scale={[0.13, 0.19, 0.025]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={player.teamId === "WHITE" ? "#c69e53" : "#789e90"} /></mesh>}
      </group>
      <group ref={leftLeg} position={[-0.12, 0.4, 0]}><mesh geometry={legGeometry}><meshStandardMaterial color={trousers} /></mesh></group>
      <group ref={rightLeg} position={[0.12, 0.4, 0]}><mesh geometry={legGeometry}><meshStandardMaterial color={trousers} /></mesh></group>
      <group ref={head} position={[0, 1.16, 0]}>
        <mesh geometry={headGeometry}><meshStandardMaterial color={skins[index % 7]} /></mesh>
        <mesh geometry={hairGeometry} position={[0, 0.04, 0]} rotation={[0, index * 0.7, index % 3 === 0 ? 0.18 : 0]}><meshStandardMaterial color={hairs[index % 7]} /></mesh>
        <mesh geometry={eyesGeometry}><meshBasicMaterial color="#3d352d" /></mesh>
      </group>
    </group>
    <mesh position={[0, 0.8, 0]} visible={false}><boxGeometry args={[1, 1.8, 0.8]} /><meshBasicMaterial /></mesh>
    <group position={onCourt ? [0, -0.1, 0] : [0, 1.8, 0]} ref={node => { if (node) anchors.set(`player:${player.id}`, node); else anchors.delete(`player:${player.id}`); }} />
  </group>;
}
