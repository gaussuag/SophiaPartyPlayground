import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { createEvent, project } from "../../src/modules/competition";
import { Avatar } from "../../src/modules/venue/Avatar";
import { AvatarPlacements } from "../../src/modules/venue/avatar-placements";
import { AvatarResults } from "../../src/modules/venue/avatar-results";
import { LocalChoreography } from "../../src/modules/venue/local-choreography";
import { worldLayout } from "../../src/modules/venue/world";
import { paddleAppearance, paddleGeometry, paddleMaterial } from "../../src/modules/venue/paddle-model";
import { avatarAppearance } from "../../src/modules/venue/avatar-appearance";
if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("Local visual QA only");
const state = createEvent("local-paddle-studio", "2026-10-30T00:00:00Z"), view = project(state);
const layout = worldLayout(390, 844);
function Equipment({ id, angle, playing }: { id: string; angle: number; playing: boolean }) {
  const clock = useRef(0);
  const player = state.players.find(p => p.id === id)!, index = state.players.indexOf(player);
  const setup = useMemo(() => {
    const positions = new AvatarPlacements(), choreography = new LocalChoreography(1);
    choreography.sync(state, view, layout); choreography.configure(true, false);
    const pose = choreography.pose(id)!; pose.base = [0, 0, 0]; pose.yaw = 0;
    return { positions, choreography, results: new AvatarResults(), anchors: new Map() };
  }, [id]);
  useFrame(({ camera, size }, dt) => {
    clock.current += Math.min(dt, .05);
    const pose = setup.choreography.pose(id)!; pose.swing = playing ? Math.pow(Math.max(0, Math.sin(clock.current * 3)), 4) : 0;
    camera.position.set(Math.sin(angle) * 5, 1.7, Math.cos(angle) * 5); camera.lookAt(0, 1.15, 0);
    if ("zoom" in camera) { camera.zoom = Math.min(size.width / 4.6, size.height / 3.0); camera.updateProjectionMatrix(); }
  });
  return <><ambientLight intensity={1.35} /><directionalLight position={[3, 5, 4]} intensity={2.2} />
    <group position={[-.8 * Math.cos(angle), 0, .8 * Math.sin(angle)]}><Avatar key={id} player={player} index={index} position={[0, 0, 0]} selected={false} muted={false} onCourt={false} status="available" begin={() => {}} layout={layout} context="initial" facing={0} {...setup} /></group>
    <mesh position={[.9 * Math.cos(angle), .5, -.9 * Math.sin(angle)]} scale={3} geometry={paddleGeometry(id, avatarAppearance(index, player.teamId).skin)} material={paddleMaterial} dispose={null} />
  </>;
}
function Studio() {
  const [id, setId] = useState("W01"), [angle, setAngle] = useState(.18), [playing, setPlaying] = useState(false);
  return <><style>{`*{box-sizing:border-box}body{margin:0;background:#e7ecdc;color:#254233;font:15px system-ui}main{max-width:1000px;margin:auto;padding:20px}h1{font-size:22px;margin:0 0 8px}.viewer{height:540px;border-radius:24px;background:#f6f4e9}nav,.players{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}button{padding:10px 14px;min-height:44px;border:1px solid #c3cdb4;border-radius:20px;background:#fcfcf4;color:#254233;cursor:pointer}button[aria-pressed=true]{background:#254233;color:#fff}i{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:7px;border:1px solid #ffffff66}p{margin:8px 0;color:#60705a}@media(max-width:500px){main{padding:12px}.viewer{height:460px}}`}</style><main>
    <h1>球拍与握持检查</h1><p>左：应用中的真实角色与握持。右：同一球拍网格放大；不读取或写入比赛。</p>
    <nav><button onClick={() => setAngle(0)}>正面</button><button onClick={() => setAngle(Math.PI / 2)}>侧面</button><button onClick={() => setAngle(Math.PI)}>背面</button><button aria-pressed={playing} onClick={() => setPlaying(!playing)}>挥拍</button></nav>
    <div className="viewer"><Canvas orthographic camera={{ position: [0, 1.7, 5], zoom: 150 }}><Equipment id={id} angle={angle} playing={playing} /></Canvas></div>
    <div className="players">{state.players.map(p => <button key={p.id} aria-pressed={p.id === id} onClick={() => setId(p.id)}><i style={{ background: paddleAppearance(p.id).face }} />{p.name}</button>)}</div>
  </main></>;
}
createRoot(document.getElementById("root")!).render(<Studio />);
