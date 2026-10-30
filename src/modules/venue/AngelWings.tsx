import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SphereGeometry, type Group } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const feather = new SphereGeometry(1, 8, 6);
function wingGeometry(side: number) {
  const shapes = [feather.clone().scale(.3, .16, .065).rotateZ(side * .3).translate(side * .22, .02, -.04),
    ...[0, 1, 2, 3, 4].map(i => feather.clone().scale(.078, .28 - i * .024, .04).rotateZ(-side * (.55 + i * .16)).translate(side * (.25 + i * .075), .08 + i * .05, -.07))];
  const geometry = mergeGeometries(shapes); shapes.forEach(shape => shape.dispose()); return geometry;
}
const leftWing = wingGeometry(-1), rightWing = wingGeometry(1); feather.dispose();
/** Two shared wing draws, without a halo; poses never request or persist data. */
export function AngelWings({ pose }: { pose: { current: { wing: number } } }) {
  const left = useRef<Group>(null), right = useRef<Group>(null);
  useFrame(() => { if (left.current) left.current.rotation.y = pose.current.wing; if (right.current) right.current.rotation.y = -pose.current.wing; });
  return <>
    {([-1, 1] as const).map(side => <group key={side} ref={side < 0 ? left : right} position={[side * .14, .92, -.18]}>
      <mesh geometry={side < 0 ? leftWing : rightWing}><meshStandardMaterial color="#fff5f2" roughness={.75} /></mesh>
    </group>)}

  </>;
}
