import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";
import { confettiPose, FINALE_CONFETTI_COUNT } from "./finale";
import type { LocalChoreography } from "./local-choreography";
const geometry=new PlaneGeometry(1,1),material=new MeshBasicMaterial({side:DoubleSide,transparent:true,opacity:.95,depthWrite:false,vertexColors:false});
const colours=["#f4c665","#c5e88c","#ecadce","#9dccdf","#f1e7a2"];
export function FinaleConfetti({choreography}:{choreography:LocalChoreography}) {
 const mesh=useRef<InstancedMesh>(null),scratch=useRef(new Object3D());
 useEffect(()=>{if(mesh.current){for(let i=0;i<FINALE_CONFETTI_COUNT;i++)mesh.current.setColorAt(i,new Color(colours[i%colours.length]));mesh.current.instanceColor!.needsUpdate=true;}},[]);
 useFrame(()=>{if(!mesh.current)return;mesh.current.visible=!!choreography.finale?.angel&&choreography.enabled;
  if(!mesh.current.visible)return;
  for(let i=0;i<FINALE_CONFETTI_COUNT;i++){const p=confettiPose(choreography.finaleClock,i),o=scratch.current;o.position.set(...p.position);o.rotation.set(...p.rotation);o.scale.set(...p.scale);o.updateMatrix();mesh.current.setMatrixAt(i,o.matrix);}mesh.current.instanceMatrix.needsUpdate=true;
 },-1);
 return <instancedMesh ref={mesh} args={[geometry,material,FINALE_CONFETTI_COUNT]} frustumCulled={false} visible={false} dispose={null} raycast={()=>{}} />;
}
