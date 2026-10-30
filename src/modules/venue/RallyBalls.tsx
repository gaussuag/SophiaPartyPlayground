import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import type { LocalChoreography } from "./local-choreography";

const sphere = new SphereGeometry(.105, 10, 7);
const shadow = new CircleGeometry(.17, 12);
const ballMaterial = new MeshBasicMaterial({ color: "#e5ff6d" });
const shadowMaterial = new MeshBasicMaterial({ color: "#264933", transparent: true, opacity: .19, depthWrite: false });

/** Six pooled balls are enough for three two-pair warmups. Unused slots hide immediately. */
export function RallyBalls({ choreography }: { choreography: LocalChoreography }) {
  const roots = useRef<(Group | null)[]>([]), balls = useRef<(Mesh | null)[]>([]), shadows = useRef<(Mesh | null)[]>([]);
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
      }
    }
  }, -1);
  return <>{Array.from({ length: 6 }, (_, i) => <group key={i} ref={node => { roots.current[i] = node; }} visible={false}>
    <mesh ref={node => { balls.current[i] = node; }} geometry={sphere} material={ballMaterial} />
    <mesh ref={node => { shadows.current[i] = node; }} geometry={shadow} material={shadowMaterial} rotation={[-Math.PI / 2, 0, 0]} />
  </group>)}</>;
}
