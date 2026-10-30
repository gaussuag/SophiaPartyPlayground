"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function GameDrawer({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`game-drawer ${className}`} onCancel={onClose} aria-labelledby="drawer-title" onClick={e => { if (e.target === ref.current) onClose(); }}>
    <header className="drawer-heading"><h2 id="drawer-title">{title}</h2><button className="icon-button" aria-label="关闭面板" onClick={onClose}><X size={20} /></button></header>
    <div className="drawer-content" data-drawer-scroll>{children}</div>
  </dialog>;
}
