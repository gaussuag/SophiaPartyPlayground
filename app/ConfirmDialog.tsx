"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function ConfirmDialog({ title, children, actionLabel, cancelLabel = "返回核对", busy, onConfirm, onClose }: { title: string; children: ReactNode; actionLabel: string; cancelLabel?: string | null; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={ref} className="confirm-dialog" onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} aria-labelledby="confirm-title"><header className="dialog-heading"><h2 id="confirm-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭确认"><X size={20} /></button></header><div className="confirm-content">{children}</div><div className="confirm-actions">{cancelLabel && <button className="button secondary" onClick={onClose}>{cancelLabel}</button>}<button className="button primary" disabled={busy} onClick={onConfirm}>{busy ? "正在保存…" : actionLabel}</button></div></dialog>;
}
