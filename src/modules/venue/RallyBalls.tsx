import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Vector3 } from "three";
import type { LocalChoreography } from "./local-choreography";
import { BALL_RADIUS } from "./paddle-pose";
const sphere = new SphereGeometry(BALL_RADIUS, 10, 7), shadow = new CircleGeometry(.17, 12);
const streak = new CylinderGeometry(.025, .045, 1, 5), flash = new RingGeometry(.62, 1, 14);
const ballMaterial = new MeshBasicMaterial({ color: "#e5ff6d" });
const shadowMaterial = new MeshBasicMaterial({ color: "#264933", transparent: true, opacity: .19, depthWrite: false });
const trailMaterial = new MeshBasicMaterial({ color: "#eaffad", transparent: true, opacity: .26, depthWrite: false });
/** Six pooled balls and tiny local contact cues; no timers or network. */
export function RallyBalls({ choreography }: { choreography: LocalChoreography }) {
  const roots = useRef<(Group | null)[]>([]), balls = useRef<(Mesh | null)[]>([]), shadows = useRef<(Mesh | null)[]>([]);
  const trails = useRef<(Mesh | null)[]>([]), impacts = useRef<(Mesh | null)[]>([]);
  const [axisY, axisZ, direction, midpoint] = useMemo(() => [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(), new Vector3()], []);
  useFrame(() => {
    for (let i = 0; i < 6; i++) {
      const root = roots.current[i], pose = choreography.balls[i];
      if (!root) continue;
      root.visible = !!pose && choreography.enabled;
      root.userData.localBall = pose?.id ?? null; root.userData.matchId = pose?.matchId ?? null;
      if (pose && balls.current[i] && shadows.current[i]) {
        balls.current[i]!.position.set(...pose.position);
        shadows.current[i]!.position.set(pose.position[0], .155, pose.position[2]);
        shadows.current[i]!.scale.setScalar(Math.max(.45, 1 - pose.position[1] * .14));
        const trail = trails.current[i]!, impact = impacts.current[i]!;
        direction.set(...pose.position).sub(midpoint.set(...pose.tail));
        const length = direction.length(); trail.visible = length > .035;
        if (trail.visible) {
          trail.position.copy(midpoint.addScaledVector(direction, .5));
          trail.quaternion.setFromUnitVectors(axisY, direction.normalize()); trail.scale.set(1, Math.min(.40, length), 1);
        }
        impact.visible = !!pose.impact;
        if (pose.impact) {
          direction.set(...pose.impact.normal); impact.position.set(...pose.impact.center).addScaledVector(direction, .006); impact.quaternion.setFromUnitVectors(axisZ, direction);
          impact.scale.setScalar(.10 + (1 - pose.impact.strength) * .10);
          (impact.material as MeshBasicMaterial).opacity = pose.impact.strength * .55;
        }
      }
    }
  }, -1);
  return <>{Array.from({ length: 6 }, (_, i) => <group key={i} ref={node => { roots.current[i] = node; }} visible={false}>
    <mesh ref={node => { balls.current[i] = node; }} geometry={sphere} material={ballMaterial} />
    <mesh ref={node => { shadows.current[i] = node; }} geometry={shadow} material={shadowMaterial} rotation={[-Math.PI / 2, 0, 0]} />
    <mesh ref={node => { trails.current[i] = node; }} geometry={streak} material={trailMaterial} />
    <mesh ref={node => { impacts.current[i] = node; }} geometry={flash}><meshBasicMaterial color="#fff6c8" side={DoubleSide} forceSinglePass transparent opacity={.5} depthWrite={false} /></mesh>
  </group>)}</>;
}
