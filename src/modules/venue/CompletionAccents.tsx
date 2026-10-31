import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, InstancedMesh, MeshBasicMaterial, Object3D, RingGeometry } from "three";
import type { LocalChoreography } from "./local-choreography";
const geometry = new RingGeometry(.55, .71, 28);
const material = new MeshBasicMaterial({ color: "#f2d788", transparent: true, opacity: .34, depthWrite: false, side: DoubleSide });
/** Shared, passive geometry; reduced motion keeps a static winner mark. */
export function CompletionAccents({ choreography, count }: { choreography: LocalChoreography; count: number }) {
  const mesh = useRef<InstancedMesh>(null), scratch = useRef(new Object3D());
  useFrame(() => {
    const node = mesh.current, plan = choreography.finale;
    if (!node) return;
    node.visible = !!plan?.winner;
    if (!plan?.winner) return;
    node.count = plan.winners.length;
    plan.winners.forEach((id, i) => {
      const p = plan.placements[id].position, o = scratch.current;
      o.position.set(p[0], p[1] + .025, p[2]); o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(choreography.reduced ? 1 : 1 + Math.sin(choreography.finaleClock * 1.2 + i * .8) * .045);
      o.updateMatrix(); node.setMatrixAt(i, o.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
  }, -1);
  return <instancedMesh ref={mesh} args={[geometry, material, count]} frustumCulled={false} visible={false} dispose={null} raycast={() => {}} />;
}
