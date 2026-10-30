import { PADDLE_MOUNT, paddleAppearance, paddleGeometry, paddleMaterial } from "./paddle-model";
/** Rigid equipment attached to the existing animated right arm; no frame loop,
 * loaders, texture requests, or model coordinates in business state. */
export function Paddle({ playerId, skin }: { playerId: string; skin: string }) {
  return <group name="paddle-grip" position={PADDLE_MOUNT.position} rotation={PADDLE_MOUNT.rotation} userData={{ paddle: playerId, palette: paddleAppearance(playerId).key }}>
    <mesh name="pickleball-paddle" geometry={paddleGeometry(playerId, skin)} material={paddleMaterial} dispose={null} />
  </group>;
}
