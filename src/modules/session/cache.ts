import type { EventState } from "../competition";
import type { PendingEnvelope } from "../records/protocol";
export type ScoreDraft = { eventId: string; matchId: string; lineupRevisionId: string; resultRevisionId?: string | null; generation: number; whiteInput: string; blackInput: string; updatedAt: string };

// The cache contains only last-known views, local inputs, and unresolved command
// identities. There is deliberately no path from a cached snapshot to a write.
export function localCache(eventId: string) {
  const prefix = `${eventId}:`;
  let opening: Promise<IDBDatabase> | undefined;
  function open() {
    return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("sophia-party-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("items");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("本机存储被其他页面阻塞"));
    });
  }
  async function write(key: string, value?: unknown) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("items", "readwrite");
      const store = transaction.objectStore("items");
      if (value === undefined) store.delete(prefix + key); else store.put(value, prefix + key);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  }
  async function read<T>(key: string): Promise<T | undefined> {
    const db = await open();
    return new Promise((resolve, reject) => { const request = db.transaction("items").objectStore("items").get(prefix + key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  async function list<T>(kind: string): Promise<T[]> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction("items").objectStore("items").getAll(IDBKeyRange.bound(prefix + kind, prefix + kind + "\uffff"));
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  return {
    snapshot: () => read<EventState>("snapshot"),
    saveSnapshot: (state: EventState) => write("snapshot", state),
    lastSyncedAt: () => read<string>("last-synced-at"),
    saveSyncTime: (value: string) => write("last-synced-at", value),
    pending: () => list<PendingEnvelope>("pending:"),
    savePending: (envelope: PendingEnvelope) => write(`pending:${envelope.commandId}`, envelope),
    clearPending: (id: string) => write(`pending:${id}`),
    drafts: () => list<ScoreDraft>("draft:"),
    saveDraft: (draft: ScoreDraft) => write(`draft:${draft.matchId}`, draft),
    clearDraft: (matchId: string) => write(`draft:${matchId}`),
    close: () => { void opening?.then(db => db.close()); },
  };
}
