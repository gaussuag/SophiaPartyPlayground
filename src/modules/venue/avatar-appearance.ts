import type { TeamId } from "../competition";

const skins = ["#d99b77", "#f4c7a1", "#b97a56", "#e2ad88", "#eac7a5", "#ca9274", "#f4d2b3"];
const hairs = ["#34302a", "#60422b", "#252b31", "#846045", "#383331", "#5b4436", "#c4955a"];

/** Shared by the single 3D scene and inexpensive SVG roster portraits. */
export function avatarAppearance(index: number, teamId: TeamId, muted = false) {
  return { skin: skins[index % skins.length], hair: hairs[index % hairs.length],
    shirt: teamId === "WHITE" ? muted ? "#d8dac6" : "#fff8de" : muted ? "#546751" : "#233d33",
    trousers: teamId === "WHITE" ? "#8f9b7c" : "#1e302a" };
}
