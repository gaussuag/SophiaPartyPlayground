import { Euler, Vector3 } from "three";
import type { Point } from "./world";
export const AVATAR_SCALE = 1.55;
export const RIGHT_SHOULDER: Point = [.28, .84, 0];
export const PADDLE_MOUNT = { position: [.015, -.315, .065] as Point, rotation: [.52, .12, -.32] as Point };
export const PADDLE_TIP = [0, .51, 0] as const;
export const PADDLE_FACE: Point = [0, .31, .0235];
export const BALL_RADIUS = .105;
export const STRIKE_ARM: Point = [-.85, 0, .12];
/** Same hierarchy as Avatar -> body -> right arm -> Paddle. Contact uses the
 * ball surface against the front face, not a point near the player's torso. */
export function paddleContact(root: Point, yaw: number, lift: number, arm: Point = STRIKE_ARM) {
  const mount = new Euler(...PADDLE_MOUNT.rotation), shoulder = new Euler(...arm), body = new Euler(0, yaw, 0);
  const center = new Vector3(...PADDLE_FACE).applyEuler(mount).add(new Vector3(...PADDLE_MOUNT.position))
    .applyEuler(shoulder).add(new Vector3(...RIGHT_SHOULDER)).add(new Vector3(0, lift, 0))
    .applyEuler(body).multiplyScalar(AVATAR_SCALE).add(new Vector3(...root));
  const normal = new Vector3(0, 0, 1).applyEuler(mount).applyEuler(shoulder).applyEuler(body).normalize();
  return { center: center.toArray() as Point, normal: normal.toArray() as Point, ball: center.addScaledVector(normal, BALL_RADIUS).toArray() as Point };
}
