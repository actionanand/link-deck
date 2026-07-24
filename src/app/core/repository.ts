import { Injectable } from '@angular/core';
import { AppSnapshot } from './models';

interface LinkDeckDatabaseBridge {
  loadState(): string;
  saveState(value: string): void;
}

interface NativeWindow extends Window {
  LinkDeckDatabase?: LinkDeckDatabaseBridge;
}

export interface BookmarkRepository {
  load(): Promise<AppSnapshot | null>;
  save(snapshot: AppSnapshot): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PlatformBookmarkRepository implements BookmarkRepository {
  private readonly databaseName = 'link-deck';
  private readonly storeName = 'app_state';
  private readonly stateKey = 'snapshot';

  async load(): Promise<AppSnapshot | null> {
    const bridge = (window as NativeWindow).LinkDeckDatabase;
    if (bridge) {
      const value = bridge.loadState();
      return value ? (JSON.parse(value) as AppSnapshot) : null;
    }
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(this.storeName, 'readonly')
        .objectStore(this.storeName)
        .get(this.stateKey);
      request.onsuccess = () => resolve((request.result as AppSnapshot | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    const bridge = (window as NativeWindow).LinkDeckDatabase;
    if (bridge) {
      bridge.saveState(JSON.stringify(snapshot));
      return;
    }
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      transaction.objectStore(this.storeName).put(snapshot, this.stateKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName);
        }
        const migration = request.transaction?.objectStore(this.storeName);
        migration?.put(1, 'schema_version');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
