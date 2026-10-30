import { parkGeometry, sceneryRaycast } from "./park-model";
import { sunlitMaterial } from "./sunlight";
/** Purely visual, static sports-park surroundings. No event/session dependency,
 * pointer handlers, animation clock, external assets or additional render pass. */
export function ParkEnvironment() {
  return <>
    <color attach="background" args={["#e8efe8"]} />
    <mesh geometry={parkGeometry.land} material={sunlitMaterial("#bbccb0")} raycast={sceneryRaycast} dispose={null} />
    <mesh geometry={parkGeometry.water} material={sunlitMaterial("#8cbfc9", { water: true })} raycast={sceneryRaycast} dispose={null} />
    <mesh geometry={parkGeometry.paving} material={sunlitMaterial("#ffffff", { vertexColors: true, tiles: true })} raycast={sceneryRaycast} dispose={null} />
    <mesh geometry={parkGeometry.scenery} material={sunlitMaterial("#ffffff", { vertexColors: true })} raycast={sceneryRaycast} dispose={null} />
  </>;
}
