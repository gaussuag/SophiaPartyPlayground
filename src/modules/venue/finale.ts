import { finaleOutcome, type EventState, type TeamId } from "../competition";
import { AVATAR_SCALE, paddleContact, STRIKE_ARM } from "./paddle-pose";
import type { BallPose, ActorPose } from "./local-choreography";
import type { Point } from "./world";
export type FinalePlacement = { position: Point; facing: number; onCourt: boolean; sideId: TeamId | null };
export type FinalePlan = { key: string; winner: TeamId | null; totals: Record<TeamId, number>; winners: string[]; receivers: string[]; angel: string | null; placements: Record<string, FinalePlacement> };
export function planFinale(state: EventState): FinalePlan | undefined {
  const outcome = finaleOutcome(state); if (!outcome.unlocked) return;
  const winners = outcome.winner ? state.players.filter(p => p.teamId === outcome.winner).map(p => p.id) : [];
  const receivers = outcome.loser ? state.players.filter(p => p.teamId === outcome.loser).map(p => p.id) : [];
  const angel = state.players.find(p => p.teamId === "FREE")?.id ?? null;
  const placements: FinalePlan["placements"] = {};
  for (const team of ["WHITE", "BLACK"] as const) {
    const people = state.players.filter(p => p.teamId === team);
    people.forEach((p,i) => {
      const winning = team === outcome.winner;
      const position: Point = outcome.winner ? winning ? [(i - (people.length-1)/2)*3.2,.18,-3.8] : [(i%3-1)*2.05,.18,2.5+Math.floor(i/3)*2.0]
        : [(i%3-1)*2.6+(team==="WHITE"?-4.1:4.1),.18,(Math.floor(i/3)-.5)*3.4];
      placements[p.id] = { position, facing: outcome.winner ? winning ? 0 : Math.PI : team === "WHITE" ? Math.PI/2 : -Math.PI/2, onCourt: true, sideId: team };
    });
  }
  if (angel) placements[angel] = { position: [0,.18,0], facing: Math.PI/2, onCourt: true, sideId: null };
  return { key: state.id+":"+state.generation+":finale:"+outcome.winner+":"+outcome.totals.WHITE+":"+outcome.totals.BLACK, winner:outcome.winner, totals:outcome.totals,winners,receivers,angel,placements };
}
const mix = (a:Point,b:Point,t:number):Point => a.map((v,i)=>v+(b[i]-v)*t) as Point;
export function angelFinale(clock:number) {
  const time=Math.max(0,clock),angle=time*.48,u=Math.min(1,time/1.4),rise=u*u*(3-2*u);
  return { offset:[Math.sin(angle)*7.2*rise,0,Math.sin(angle*2)*3.8*rise] as Point, yaw:Math.atan2(7.2*Math.cos(angle),7.6*Math.cos(angle*2)), lift:.19+rise*(1.51+Math.sin(time*.9)*.22) };
}
/** Receives the existing local clock; never owns a loop, request, or score. */
export function sampleFinale(plan:FinalePlan,clock:number) {
  const poses=new Map<string,Partial<ActorPose>>(),balls:BallPose[]=[];
  let index=0;
  for(const [id,placement]of Object.entries(plan.placements)) {
    const i=index++,pulse=Math.sin(clock*2+i);
    poses.set(id,{offset:[0,0,0],yaw:placement.facing,swing:0,stretch:plan.winner ? .08 : .35+.3*pulse,look:Math.sin(clock+i)*.18,gait:plan.winner ? 0 : pulse*.12,walking:false,action:plan.winner ? plan.winners.includes(id)?"finale-serve":"finale-receive":"finale-celebrate",stroke:plan.winner ? {arm:[...STRIKE_ARM],lift:0}:undefined});
  }
  plan.winners.forEach((id,i)=>{
    const duration=2.15+i*.09,phase=clock/duration-i*.17,u=phase-Math.floor(phase),receiver=plan.receivers[(i+Math.floor(phase))%plan.receivers.length];
    const source=plan.placements[id],target=plan.placements[receiver];
    const arm:Point=u<.14 ? mix(STRIKE_ARM,[-1.5,-.32,-.22],Math.min(1,u/.14)) : u>.82 ? mix([.12,.46,.06],STRIKE_ARM,(u-.82)/.18) : [-.22,0,-.12];
    poses.get(id)!.stroke={arm,lift:0};
    const receive=poses.get(receiver)!; receive.stretch=(receive.stretch??0)+Math.exp(-(((u-.73)/.09)**2))*.4;
    const from=paddleContact(source.position,source.facing,0),to=paddleContact(target.position,target.facing,0);
    if(phase>=0&&u<.8){
      const travel=(t:number):Point=>{const p=mix(from.ball,to.ball,t);p[1]+=Math.sin(Math.PI*t)*1.35;return p;};
      balls.push({id:plan.key+":serve:"+id,matchId:"finale",position:travel(u/.8),tail:travel(Math.max(0,u-.023)/.8),bounce:0,phase:u,source:id,receiver,...u<.045?{impact:{center:from.center,normal:from.normal,strength:1-u/.045}}:{}});
    }
  });
  if(plan.angel){const flight=angelFinale(clock);poses.set(plan.angel,{offset:flight.offset,yaw:flight.yaw,walking:true,action:"finale-confetti",stretch:.55+Math.sin(clock*3)*.2,stroke:{lift:flight.lift,arm:[-.65+Math.sin(clock*3)*.25,0,-.65]}});}
  return {poses,balls};
}
export const FINALE_CONFETTI_COUNT=112;
export function confettiPose(clock:number,index:number) {
  const life=2.7+(index%7)*.19,age=(clock+index*.137)%life,emitter=angelFinale(clock-age);
  return { position:[emitter.offset[0]+Math.sin(index*2.4)*age*.34, .18+emitter.lift*AVATAR_SCALE+1.5-age*.96, emitter.offset[2]+Math.cos(index*1.7)*age*.26] as Point,
    rotation:[clock*(1+index%3),clock*.7+index,Math.sin(clock*2+index)] as Point,
    scale:clock-age<0 ? [0,0,0] as Point : [index%7===0?.08:.16,index%7===0?.90:.25,1] as Point };
}
