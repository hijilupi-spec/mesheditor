export interface PromptHistoryEntry {
  id?: number;
  prompt: string;
  images: string[];
  timestamp: number;
}

const DB_NAME = 'mesheditor_ai_history_db';
const DB_VERSION = 1;
const STORE_NAME = 'prompt_history';
const MAX_HISTORY_ENTRIES = 100;

/**
 * IndexedDB-backed store for AI prompt history (text + attached images),
 * with an in-memory cache for synchronous ArrowUp/ArrowDown paging and
 * automatic fallback when IndexedDB is unavailable.
 */
export class PromptHistoryStore {
  private entries: PromptHistoryEntry[] = [];
  private initPromise: Promise<PromptHistoryEntry[]> | null = null;
  private db: IDBDatabase | null = null;

  public async init(): Promise<PromptHistoryEntry[]> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.loadFromIndexedDB();
    return this.initPromise;
  }

  public getEntries(): PromptHistoryEntry[] {
    return this.entries;
  }

  public async addEntry(prompt: string, images: string[]): Promise<void> {
    const cleanPrompt = (prompt || '').trim();
    const cleanImages = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!cleanPrompt && cleanImages.length === 0) return;

    await this.init();

    const last = this.entries[this.entries.length - 1];
    if (
      last &&
      last.prompt === cleanPrompt &&
      last.images.length === cleanImages.length &&
      last.images.every((img, idx) => img === cleanImages[idx])
    ) {
      return;
    }

    const entry: PromptHistoryEntry = {
      prompt: cleanPrompt,
      images: [...cleanImages],
      timestamp: Date.now(),
    };

    const insertedId = await this.persistEntry(entry);
    if (insertedId !== undefined) {
      entry.id = insertedId;
    }
    this.entries.push(entry);

    if (this.entries.length > MAX_HISTORY_ENTRIES) {
      const overflow = this.entries.splice(0, this.entries.length - MAX_HISTORY_ENTRIES);
      for (const old of overflow) {
        if (old.id !== undefined) {
          await this.deleteEntryById(old.id);
        }
      }
    }
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (this.db) {
      return Promise.resolve(this.db);
    }
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, {
              keyPath: 'id',
              autoIncrement: true,
            });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve(this.db);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async loadFromIndexedDB(): Promise<PromptHistoryEntry[]> {
    const db = await this.openDatabase();
    if (!db) return this.entries;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          rows.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          this.entries = rows.slice(-MAX_HISTORY_ENTRIES);
          resolve(this.entries);
        };
        req.onerror = () => resolve(this.entries);
      } catch {
        resolve(this.entries);
      }
    });
  }

  private async persistEntry(entry: PromptHistoryEntry): Promise<number | undefined> {
    const db = await this.openDatabase();
    if (!db) return undefined;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(entry);
        req.onsuccess = () => {
          resolve(typeof req.result === 'number' ? req.result : undefined);
        };
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  private async deleteEntryById(id: number): Promise<void> {
    const db = await this.openDatabase();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
