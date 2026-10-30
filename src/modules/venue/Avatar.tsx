import { useEffect, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, CapsuleGeometry, Group, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EventProjection, Player } from "../competition";
import type { Anchors } from "./Scene";
import type { AvatarPlacements } from "./avatar-placements";
import { AvatarMotion } from "./avatar-motion";
import { AvatarAttention } from "./avatar-attention";
import { AngelWings } from "./AngelWings";
import { Paddle } from "./Paddle";
import { AVATAR_SCALE, RIGHT_SHOULDER } from "./paddle-pose";
import { angelPose } from "./angel-pose";
import { avatarAppearance } from "./avatar-appearance";
import type { LocalChoreography } from "./local-choreography";
import type { AvatarResults } from "./avatar-results";
import type { Point, WorldLayout } from "./world";

const headGeometry = new SphereGeometry(0.24, 12, 10);
const hairGeometry = new SphereGeometry(0.249, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
const torsoGeometry = new CapsuleGeometry(0.215, 0.3, 3, 8);
const armGeometry = new CapsuleGeometry(0.068, 0.28, 2, 6).translate(0, -0.14, 0);
const legGeometry = new CapsuleGeometry(0.078, 0.24, 2, 6).translate(0, -0.14, 0);
const eyesGeometry = mergeGeometries([-1, 1].map(side => new BoxGeometry(0.04, 0.045, 0.035).translate(side * 0.085, 0.02, 0.225)));
export function Avatar({ player, index, position, selected, muted, onCourt, status, anchors, begin, layout, context, facing, results, choreography, positions, candidateKey }: {
  player: Player; index: number; position: Point; selected: boolean; muted: boolean; onCourt: boolean;
  status: EventProjection["playerStates"][string]["status"]; anchors: Anchors;
  begin: (playerId: string, event: PointerEvent) => void;
  layout: WorldLayout; context: string; facing: number; results: AvatarResults; choreography: LocalChoreography;
  positions: AvatarPlacements; candidateKey?: string;
}) {
  const root = useRef<Group>(null), body = useRef<Group>(null), head = useRef<Group>(null);
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null), leftLeg = useRef<Group>(null), rightLeg = useRef<Group>(null);
  const invitationRing = useRef<Group>(null);
  const angel = player.teamId === "FREE";
  const flight = useRef({ clock: 0, wing: .18, lift: .19, arriving: false });
  const invalidate = useThree(s => s.invalidate);
  const [initial] = useState(position);
  const [motion] = useState(() => new AvatarMotion(position, facing, context, angel ? "fly" : "walk"));
  const [attention] = useState(() => new AvatarAttention());
  const animation = useRef({ selected: 0, result: 0, resultKind: "acknowledge", resultToken: 0, context, facing });
  const decoration = useRef<Point>([0, 0, 0]);
  useEffect(() => { animation.current.selected = selected && !choreography.reduced ? 0.5 : 0; invalidate(); }, [selected, choreography, invalidate]);
  useEffect(() => { attention.cue(candidateKey ?? null, choreography.reduced); invalidate(); }, [candidateKey, attention, choreography, invalidate]);
  useFrame((_, delta) => {
    if (!root.current || !body.current || !head.current || !leftArm.current || !rightArm.current || !leftLeg.current || !rightLeg.current) return;
    const a = animation.current, enabled = choreography.enabled, dt = enabled ? Math.min(delta, 0.05) : 0;
    const destination = positions.get(player.id) ?? { position, facing };
    const [x, y, z] = destination.position;
    const changed = motion.destination.some((n, i) => n !== destination.position[i]);
    if (changed || animation.current.context !== positions.context || a.facing !== destination.facing) {
      const from = animation.current.context === positions.context && changed ? root.current.position.toArray() as Point : undefined;
      decoration.current = [0, 0, 0]; animation.current.context = positions.context; animation.current.facing = destination.facing; animation.current.result = 0;
      motion.retarget(destination.position, destination.facing, layout, positions.context, choreography.reduced || !choreography.active, from);
      choreography.arrived(player.id, !motion.moving);
    }

    const local = choreography.pose(player.id), reduced = choreography.reduced;
    const invitation = attention.step(dt, reduced, !choreography.active);
    const reaction = results.get(player.id);
    if (reaction && reaction.token !== a.resultToken) { a.resultToken = reaction.token; a.result = !enabled ? 0 : 1.35; a.resultKind = reaction.kind; }
    const oldDistance = motion.travelled;
    const moving = motion.step(dt, reduced || !choreography.active);
    const walking = motion.walking && motion.travelled > oldDistance;
    const phase = motion.travelled * 7.2;
    const sameBase = !!local && local.base.every((n, i) => Math.abs(n - [x, y, z][i]) < .001);
    if (angel) {
      if (reduced || !choreography.active) flight.current.arriving = false;
      else if (moving) flight.current.arriving = true;
    }
    const landing = angel && flight.current.arriving && !moving;
    const settled = !motion.moving && sameBase && !landing;
    choreography.arrived(player.id, settled);
    const target = settled && local ? local.offset : [0, 0, 0];
    const stroke = settled && !reduced ? local?.stroke : undefined;
    if (reduced || moving) decoration.current = [0, 0, 0];
    else if (enabled && !local?.held) decoration.current = stroke ? [...target] as Point : decoration.current.map((n, i) => n + (target[i] - n) * Math.min(1, dt * 12)) as Point;
    const swing = settled && local ? local.swing : 0, stretch = settled && local ? local.stretch : 0;
    const look = settled && local ? local.look : 0, gait = settled && local ? local.gait : 0;
    a.selected = Math.max(0, a.selected - dt); a.result = Math.max(0, a.result - dt);
    const selection = reduced ? 0 : Math.sin(a.selected / 0.5 * Math.PI);
    const cheer = a.result > 0 ? Math.sin(Math.min(1, a.result / 0.28) * Math.PI / 2) : 0;
    root.current.position.set(...motion.position.map((n, i) => n + decoration.current[i]) as Point);
    root.current.userData.walking = motion.moving || landing;
    root.current.userData.destination = motion.destination;
    root.current.userData.travelled = motion.travelled;
    root.current.userData.inviting = invitation.animating;
    root.current.userData.ambientWalking = settled && !!local?.walking;
    root.current.userData.localAction = settled ? local?.action : "transfer";
    root.current.userData.localHeld = !!local?.held;
    if (invitationRing.current) invitationRing.current.scale.setScalar(invitation.ringScale);
    body.current.rotation.y = settled && local ? local.yaw : motion.yaw;
    if (enabled && (!local?.held || moving)) flight.current.clock += dt;
    const airborne = angelPose(flight.current.clock, walking || landing || !!local?.walking, reduced);
    flight.current.wing = airborne.wing;
    const targetLift = landing ? .19 : airborne.lift;
    if (reduced || !choreography.active) flight.current.lift = targetLift;
    else if (!local?.held || moving || landing) flight.current.lift += (targetLift - flight.current.lift) * Math.min(1, dt * 10);
    if (landing && Math.abs(flight.current.lift - .19) < .01) flight.current.arriving = false;
    root.current.userData.flying = angel && (motion.moving || landing);
    body.current.position.y = stroke ? stroke.lift : angel ? flight.current.lift : walking ? Math.abs(Math.sin(phase)) * 0.035 : Math.abs(gait) * .045;
    body.current.rotation.z = stroke ? 0 : angel ? airborne.bank : walking ? Math.sin(phase) * 0.025 : gait * .04;
    head.current.rotation.x = -selection * 0.12 + (a.resultKind === "acknowledge" ? cheer * 0.18 : 0);
    head.current.rotation.y = look;
    const stride = angel ? 0 : walking ? Math.sin(phase) * 0.5 : gait;
    leftLeg.current.rotation.x = angel ? airborne.leg : stride; rightLeg.current.rotation.x = angel ? airborne.leg : -stride;
    leftArm.current.rotation.x = -stride * 0.7 - stretch * .6;
    rightArm.current.rotation.x = -0.22 + stride * 0.7 - selection * 0.45 - (status === "playing" ? 0.35 : 0) - swing * 1.35;
    leftArm.current.rotation.z = 0.12 + stretch * 1.8 + (a.resultKind === "celebrate" ? cheer * 2.2 : 0);
    rightArm.current.rotation.z = -0.12 - selection * 0.4 - stretch * 1.8 - swing * .35 - (a.resultKind === "celebrate" ? cheer * 2.2 : 0) - invitation.wave;
    rightArm.current.rotation.y = 0;
    if (stroke) rightArm.current.rotation.set(...stroke.arm);
    leftLeg.current.position.x = status === "playing" ? -0.16 : -0.12;
    rightLeg.current.position.x = status === "playing" ? 0.16 : 0.12;
    if (enabled && (moving || invitation.animating || a.selected > 0 || a.result > 0)) invalidate();
  });
  const { skin, hair, shirt, trousers } = avatarAppearance(index, player.teamId, muted);
  const ringColor = selected ? "#e4fc86" : status === "playing" ? "#84ded0" : status === "played_this_round" ? "#c8a86a" : "#e6cb85";
  return <group ref={root} position={initial} scale={AVATAR_SCALE} userData={{ playerId: player.id }} onPointerDown={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); begin(player.id, event.nativeEvent); }}>
    {candidateKey && <group ref={invitationRing} position={[0, 0.028, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.5, 0.62, 32]} /><meshBasicMaterial color="#e8ff89" transparent opacity={0.95} depthWrite={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.5, 24]} /><meshBasicMaterial color="#e2fa91" transparent opacity={0.24} depthWrite={false} /></mesh>
    </group>}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><circleGeometry args={[0.34, 20]} /><meshBasicMaterial color="#435740" transparent opacity={0.13} depthWrite={false} /></mesh>
    {(selected || status !== "available") && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}><ringGeometry args={[selected ? 0.38 : 0.35, selected ? 0.49 : 0.39, 24]} /><meshBasicMaterial color={ringColor} transparent opacity={muted && !selected ? 0.55 : 0.95} /></mesh>}
    <group ref={body} rotation={[0, facing, 0]}>
      {angel && <AngelWings pose={flight} />}
      <mesh geometry={torsoGeometry} position={[0, 0.68, 0]}><meshStandardMaterial color={shirt} roughness={0.9} /></mesh>
      <group ref={leftArm} position={[0.28, 0.84, 0]} rotation={[0, 0, 0.12]}><mesh geometry={armGeometry}><meshStandardMaterial color={shirt} roughness={0.9} /></mesh></group>
      <group name="right-arm" ref={rightArm} position={RIGHT_SHOULDER} rotation={[0, 0, -0.12]}>
        <mesh geometry={armGeometry}><meshStandardMaterial color={shirt} roughness={0.9} /></mesh>
        <Paddle playerId={player.id} skin={skin} />
      </group>
      <group ref={leftLeg} position={[-0.12, 0.4, 0]}><mesh geometry={legGeometry}><meshStandardMaterial color={trousers} /></mesh></group>
      <group ref={rightLeg} position={[0.12, 0.4, 0]}><mesh geometry={legGeometry}><meshStandardMaterial color={trousers} /></mesh></group>
      <group ref={head} position={[0, 1.16, 0]}>
        <mesh geometry={headGeometry}><meshStandardMaterial color={skin} /></mesh>
        <mesh geometry={hairGeometry} position={[0, 0.04, 0]} rotation={[0, index * 0.7, index % 3 === 0 ? 0.18 : 0]}><meshStandardMaterial color={hair} /></mesh>
        <mesh geometry={eyesGeometry}><meshBasicMaterial color="#3d352d" /></mesh>
      </group>
    </group>
    <mesh position={[0, 0.8, 0]} visible={false}><boxGeometry args={[1, 1.8, 0.8]} /><meshBasicMaterial /></mesh>
    <group position={onCourt || player.teamId === "WHITE" ? [0, -0.1, 0] : player.teamId === "FREE" ? [0, 2.05, 0] : [0, 1.8, 0]} ref={node => { if (node) anchors.set(`player:${player.id}`, node); else anchors.delete(`player:${player.id}`); }} />
  </group>;
}
