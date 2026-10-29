import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CircleDot, Fan, Hand } from "lucide-react";
import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, SphereGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLAY_IDS, PlayTap, ScenePlayController, playPose, playPositions, type PlayId } from "./scene-play";
import type { WorldLayout } from "./world";
import "./scene-play.css";

type Anchors = Map<string, Group>;
type Elements = Map<string, HTMLDivElement>;
const keyFor = (id: PlayId) => `play:${id}`;
const icons = { ball: CircleDot, mascot: Hand, fan: Fan };
const labels = { ball: "弹一下", mascot: "打招呼", fan: "吹吹风" };
const activeLabels = { ball: "接住啦", mascot: "嗨！", fan: "关风扇" };
const accessible = { ball: "轻点练习球，弹跳后回到原位", mascot: "向小太阳打招呼", fan: "打开场边风扇，十秒后自动关闭" };

// Shared static meshes keep these small toys inexpensive without a model loader.
const ballHoles = mergeGeometries(Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4;
  return new SphereGeometry(0.045, 5, 4).translate(Math.cos(angle) * 0.255, Math.sin(angle) * 0.255, 0.14);
}));
const sunRays = mergeGeometries(Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4;
  return new ConeGeometry(0.12, 0.29, 5).rotateZ(-angle).translate(Math.sin(angle) * 0.58, Math.cos(angle) * 0.58, 0);
}));
const eyes = mergeGeometries([-1, 1].map(side => new SphereGeometry(0.04, 6, 5).translate(side * 0.13, 0.07, 0.405)));
const feet = mergeGeometries([-1, 1].map(side => new CapsuleGeometry(0.11, 0.16, 2, 6).rotateX(Math.PI / 2).translate(side * 0.2, 0.12, 0.13)));
const fanStand = mergeGeometries([
  new CylinderGeometry(0.46, 0.49, 0.14, 12).translate(0, 0.08, 0),
  new CylinderGeometry(0.075, 0.1, 0.85, 7).translate(0, 0.55, 0),
]);
const fanGuard = mergeGeometries([
  ...[0.3, 0.55].map(r => new TorusGeometry(r, 0.025, 4, 20)),
  ...Array.from({ length: 4 }, (_, i) => new BoxGeometry(0.018, 1.1, 0.018).rotateZ(i * Math.PI / 4)),
]);
const fanBlades = mergeGeometries(Array.from({ length: 3 }, (_, i) => new CapsuleGeometry(0.115, 0.25, 2, 6).translate(0, 0.25, 0).rotateZ(i * Math.PI * 2 / 3)));

function PlayButton({ id, controller, disabled }: { id: PlayId; controller: ScenePlayController; disabled: boolean }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const [tap] = useState(() => new PlayTap());
  const active = snapshot[id], Icon = icons[id];
  return <button className="scene-play-button" data-scene-play={id} data-active={active} disabled={disabled}
    aria-label={id === "fan" && active ? "关闭场边风扇" : accessible[id]} aria-pressed={id === "fan" ? active : undefined}
    title={accessible[id]} onPointerDown={event => {
      if (event.button === 0) tap.down(event.pointerId, event.clientX, event.clientY);
    }} onPointerMove={event => tap.move(event.pointerId, event.clientX, event.clientY)}
    onPointerUp={event => tap.up(event.pointerId, event.clientX, event.clientY)}
    onPointerCancel={() => tap.cancel()} onLostPointerCapture={event => tap.lost(event.pointerId)}
    onClick={event => {
      // Do not stop pointer propagation: the shared venue gesture owner can orbit
      // from this button and suppress the eventual click after any camera gesture.
      if (event.detail !== 0 && !tap.consume(event.clientX, event.clientY)) return;
      event.stopPropagation(); controller.activate(id, performance.now());
    }}><Icon size={17} aria-hidden="true" /><span>{active ? activeLabels[id] : labels[id]}</span></button>;
}

/** Mount inside the existing projected-labels container; uses its same projection pass. */
export function ScenePlayLabels({ controller, elements, disabled = false }: { controller: ScenePlayController; elements: Elements; disabled?: boolean }) {
  return <>{PLAY_IDS.map(id => <div key={id} className="projected-label play-anchor" ref={node => {
    if (node) elements.set(keyFor(id), node); else elements.delete(keyFor(id));
  }}><PlayButton id={id} controller={controller} disabled={disabled} /></div>)}</>;
}

/** Mount beside Scene in the Canvas, before LabelProjection. */
export function ScenePlay({ controller, layout, anchors, disabled = false }: { controller: ScenePlayController; layout: WorldLayout; anchors: Anchors; disabled?: boolean }) {
  const invalidate = useThree(s => s.invalidate);
  const ball = useRef<Group>(null), mascot = useRef<Group>(null), hand = useRef<Group>(null);
  const fanHead = useRef<Group>(null), rotor = useRef<Group>(null);
  const reduced = useRef(false);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const positions = playPositions(layout);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      clearTimeout(timer);
      invalidate();
      if (Number.isFinite(controller.nextDeadline)) timer = setTimeout(() => controller.advance(performance.now()), Math.max(0, controller.nextDeadline - performance.now()) + 1);
    };
    const preference = () => { reduced.current = media.matches; wake(); };
    const visibility = () => { if (document.hidden) controller.cancel(); };
    reduced.current = media.matches;
    const unsubscribe = controller.subscribe(wake);
    media.addEventListener("change", preference); document.addEventListener("visibilitychange", visibility);
    wake();
    return () => {
      unsubscribe(); clearTimeout(timer); controller.cancel();
      media.removeEventListener("change", preference); document.removeEventListener("visibilitychange", visibility);
    };
  }, [controller, invalidate]);
  useEffect(() => { if (disabled) controller.cancel(); }, [controller, disabled]);
  useFrame(() => {
    const now = performance.now();
    controller.advance(now);
    const pose = playPose(controller, now, reduced.current);
    if (ball.current) { ball.current.position.set(pose.ballX, pose.ballY, 0); ball.current.rotation.z = pose.ballTurn; }
    if (mascot.current) mascot.current.rotation.z = pose.mascotTilt;
    if (hand.current) hand.current.rotation.z = pose.wave;
    if (fanHead.current) fanHead.current.rotation.y = pose.fanTilt;
    if (rotor.current) rotor.current.rotation.z = pose.fanTurn;
    if (controller.active && !reduced.current) invalidate();
  });
  const anchor = (id: PlayId) => (node: Group | null) => { if (node) anchors.set(keyFor(id), node); else anchors.delete(keyFor(id)); };
  const activate = (id: PlayId) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!disabled && event.delta <= 6) controller.activate(id, performance.now());
  };
  return <group>
    <group position={positions.ball} onClick={activate("ball")} userData={{ scenePlay: "ball" }}>
      <mesh position={[0, 0.025, 0]}><cylinderGeometry args={[0.72, 0.76, 0.06, 20]} /><meshStandardMaterial color="#d5c399" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}><ringGeometry args={[0.55, 0.59, 24]} /><meshBasicMaterial color="#f6f1cf" /></mesh>
      <group ref={ball} position={[0, 0.35, 0]}>
        <mesh><sphereGeometry args={[0.3, 14, 10]} /><meshStandardMaterial color="#e5ed64" roughness={0.65} /></mesh>
        <mesh geometry={ballHoles}><meshStandardMaterial color="#697c39" roughness={1} /></mesh>
      </group>
      <group position={[0, 0.1, 1.15]} ref={anchor("ball")} />
    </group>
    <group position={positions.mascot} onClick={activate("mascot")} userData={{ scenePlay: "mascot" }}>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.64, 0.7, 0.1, 14]} /><meshStandardMaterial color="#d5c399" /></mesh>
      <group ref={mascot}>
        <mesh geometry={feet}><meshStandardMaterial color="#596e39" /></mesh>
        <mesh position={[0, 0.47, 0]}><capsuleGeometry args={[0.25, 0.3, 3, 8]} /><meshStandardMaterial color="#9fb66a" /></mesh>
        <group position={[0, 1.05, 0]}>
          <mesh geometry={sunRays}><meshStandardMaterial color="#ddac55" /></mesh>
          <mesh><sphereGeometry args={[0.44, 14, 10]} /><meshStandardMaterial color="#f8d37c" roughness={0.9} /></mesh>
          <mesh geometry={eyes}><meshBasicMaterial color="#465037" /></mesh>
          <mesh position={[0, -0.08, 0.43]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.085, 0.013, 4, 10, Math.PI]} /><meshBasicMaterial color="#755b39" /></mesh>
        </group>
        <group ref={hand} position={[0.25, 0.65, 0]}>
          <mesh position={[0.2, 0, 0]} rotation={[0, 0, -0.9]}><capsuleGeometry args={[0.07, 0.3, 2, 6]} /><meshStandardMaterial color="#9fb66a" /></mesh>
          <mesh position={[0.35, 0.17, 0]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#f8d37c" /></mesh>
        </group>
      </group>
      <group position={[0, 0.1, 1.15]} ref={anchor("mascot")} />
    </group>
    <group position={positions.fan} onClick={activate("fan")} userData={{ scenePlay: "fan" }}>
      <mesh geometry={fanStand}><meshStandardMaterial color="#597965" roughness={0.8} /></mesh>
      <group ref={fanHead} position={[0, 1.25, 0]}>
        <group ref={rotor} position={[0, 0, -0.05]}><mesh geometry={fanBlades}><meshStandardMaterial color="#cae0b3" side={DoubleSide} /></mesh></group>
        <mesh geometry={fanGuard} position={[0, 0, 0.08]}><meshStandardMaterial color="#607b63" metalness={0.15} roughness={0.65} /></mesh>
        <mesh position={[0, 0, 0.12]}><sphereGeometry args={[0.115, 8, 6]} /><meshStandardMaterial color="#f3e8bf" /></mesh>
      </group>
      <mesh position={[0, 0.21, 0.26]}><sphereGeometry args={[0.055, 6, 5]} /><meshBasicMaterial color={snapshot.fan ? "#e9ff9a" : "#375741"} /></mesh>
      <group position={[0, 0.1, 1.15]} ref={anchor("fan")} />
    </group>
  </group>;
}
