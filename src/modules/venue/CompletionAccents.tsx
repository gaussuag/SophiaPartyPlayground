import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CircleGeometry, Color, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, RingGeometry, ShaderMaterial } from "three";
import type { LocalChoreography } from "./local-choreography";
const geometry = new RingGeometry(.55, .71, 28);
const material = new MeshBasicMaterial({ color: "#f2d788", transparent: true, opacity: .44, depthWrite: false, side: DoubleSide });
const groundGeometry = new CircleGeometry(1, 48);
const groundMaterial = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide,
  uniforms: { warmth: { value: new Color("#ffd99d") } },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: "uniform vec3 warmth;varying vec2 vUv;void main(){float a=(1.-smoothstep(.12,.5,length(vUv-.5)))*.22;gl_FragColor=vec4(warmth,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
});
/** Shared, passive geometry; reduced motion keeps a static winner mark. */
export function CompletionAccents({ choreography, count }: { choreography: LocalChoreography; count: number }) {
  const ground = useRef<Mesh>(null), mesh = useRef<InstancedMesh>(null), scratch = useRef(new Object3D());
  useFrame(() => {
    const node = mesh.current, plan = choreography.finale;
    if (ground.current) { ground.current.visible = !!plan; if (plan) ground.current.scale.set(3.5, Math.max(...Object.values(plan.placements).map(p => Math.abs(p.position[2]))) + 1.4, 1); }
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
  return <><mesh ref={ground} geometry={groundGeometry} material={groundMaterial} position={[0, .135, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false} dispose={null} raycast={() => {}} /><instancedMesh ref={mesh} args={[geometry, material, count]} frustumCulled={false} visible={false} dispose={null} raycast={() => {}} /></>;
}
