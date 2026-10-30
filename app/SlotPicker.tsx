"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Player } from "../src/modules/competition";
import type { Placement } from "../src/modules/venue";
import { avatarAppearance } from "../src/modules/venue/avatar-appearance";

export function SlotPicker({ target, courtNumber, players, roster, disabled, onChoose, onClose }: {
  target: Placement; courtNumber: number; players: Player[]; roster: Player[]; disabled: boolean;
  onChoose: (playerId: string) => void; onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector<HTMLButtonElement>("[data-picker-player]:not(:disabled)")?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <section ref={root} className="slot-picker" aria-labelledby="slot-picker-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><span className="picker-court">{String(courtNumber).padStart(2, "0")}</span><h2 id="slot-picker-title"><i className={"team-dot " + target.sideId.toLowerCase()} />{target.sideId === "WHITE" ? "白队" : "黑队"}{target.gender ? target.gender === "MALE" ? " · 男" : " · 女" : " · 不限性别"}</h2><button className="icon-button" aria-label="关闭选人面板" onClick={onClose}><X size={18} /></button></header>
    <div className="slot-picker-grid" style={{ gridTemplateColumns: `repeat(${Math.min(players.length || 1, 4)},minmax(0,1fr))` }}>
      {players.map(player => {
        const look = avatarAppearance(roster.findIndex(p => p.id === player.id), player.teamId);
        return <button key={player.id} data-picker-player={player.id} className={"picker-player " + player.teamId.toLowerCase()} disabled={disabled} aria-label={`安排 ${player.name} 到 ${courtNumber} 号场 ${target.slotId}`} onClick={() => onChoose(player.id)}>
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="31" fill={player.teamId === "WHITE" ? "#e1e9c8" : "#b7d4aa"} /><path d="M9 64v-8c0-13 9-21 23-21s23 8 23 21v8" fill={look.shirt} /><path d="M24 35h16v9c-3 5-13 5-16 0z" fill={look.skin} /><ellipse cx="32" cy="25" rx="15" ry="17" fill={look.skin} /><path d="M17 25v-9C20 0 48 4 48 19l-2 10-3-13c-10 6-13 4-22 3z" fill={look.hair} /><circle cx="26" cy="26" r="1.6" fill="#34352b" /><circle cx="38" cy="26" r="1.6" fill="#34352b" /><path d="M28 33q4 3 8 0" fill="none" stroke="#805b45" strokeWidth="1.5" strokeLinecap="round" /><path d="M16 60h32" stroke={look.trousers} strokeWidth="3" opacity=".5" /></svg>
          <span>{player.name}</span>
        </button>;
      })}
      {!players.length && <p className="picker-empty">暂时没有符合条件的选手</p>}
    </div>
  </section>;
}
