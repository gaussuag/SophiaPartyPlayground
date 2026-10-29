"use client";
import { useMemo, useSyncExternalStore } from "react";
import { connect, type EventSession, type SessionView } from "../src/modules/session";

type Snapshot = { session: EventSession | null; view: SessionView | null };
const empty: Snapshot = { session: null, view: null };

/** Connect only after subscription; SSR and abandoned renders perform no work. */
function bindingFor(eventId: string) {
  let snapshot = empty;
  let session: EventSession | null = null;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!session) {
        const connected = connect(eventId);
        session = connected;
        snapshot = { session: connected, view: connected.getView() };
        unsubscribe = connected.subscribe(() => {
          snapshot = { session: connected, view: connected.getView() };
          for (const notify of listeners) notify();
        });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { unsubscribe?.(); session?.dispose(); session = null; snapshot = empty; }
      };
    },
  };
}

export function useEventSession(eventId: string): Snapshot {
  const binding = useMemo(() => bindingFor(eventId), [eventId]);
  return useSyncExternalStore(binding.subscribe, binding.getSnapshot, () => empty);
}
