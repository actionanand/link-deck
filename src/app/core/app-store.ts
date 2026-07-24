import { computed, inject, Injectable, signal } from '@angular/core';
import {
  AppSettings,
  AppSnapshot,
  Bookmark,
  createInitialSnapshot,
  Folder,
  Profile,
} from './models';
import { PlatformBookmarkRepository } from './repository';

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly repository = inject(PlatformBookmarkRepository);
  readonly ready = signal(false);
  readonly profiles = signal<readonly Profile[]>([]);
  readonly folders = signal<readonly Folder[]>([]);
  readonly bookmarks = signal<readonly Bookmark[]>([]);
  readonly settings = signal<AppSettings>(createInitialSnapshot().settings);
  readonly selectedProfileId = signal('');
  readonly selectedFolderId = signal<string | null>(null);
  readonly locked = signal(false);
  readonly defaultProfile = computed(
    () => this.profiles().find((profile) => profile.isDefault) ?? this.profiles()[0],
  );

  async initialize(): Promise<void> {
    const stored = await this.repository.load();
    const snapshot = stored ?? createInitialSnapshot();
    this.apply(snapshot);
    this.selectedProfileId.set(this.defaultProfile()?.id ?? '');
    this.locked.set(snapshot.settings.pinEnabled);
    this.ready.set(true);
    if (!stored) await this.persist();
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    this.settings.update((settings) => ({ ...settings, ...patch }));
    await this.persist();
  }

  async addBookmark(
    value: Pick<Bookmark, 'url' | 'title' | 'notes' | 'tags' | 'profileId' | 'folderId'>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      description: '',
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(value.url).hostname)}&sz=64`,
      favourite: false,
      archived: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      visitCount: 0,
      sortOrder: this.bookmarks().length,
      ...value,
    };
    this.bookmarks.update((bookmarks) => [...bookmarks, bookmark]);
    await this.persist();
  }

  async updateBookmark(id: string, patch: Partial<Bookmark>): Promise<void> {
    this.bookmarks.update((bookmarks) =>
      bookmarks.map((bookmark) =>
        bookmark.id === id
          ? { ...bookmark, ...patch, updatedAt: new Date().toISOString() }
          : bookmark,
      ),
    );
    await this.persist();
  }

  async addProfile(name: string): Promise<void> {
    this.profiles.update((profiles) => [
      ...profiles,
      { id: crypto.randomUUID(), name, isDefault: false, sortOrder: profiles.length },
    ]);
    await this.persist();
  }

  async addFolder(name: string, profileId: string, parentId: string | null): Promise<Folder> {
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      profileId,
      parentId,
      sortOrder: this.folders().filter((item) => item.parentId === parentId).length,
    };
    this.folders.update((folders) => [...folders, folder]);
    await this.persist();
    return folder;
  }

  async replace(snapshot: AppSnapshot): Promise<void> {
    this.apply(snapshot);
    this.selectedProfileId.set(this.defaultProfile()?.id ?? '');
    await this.persist();
  }

  snapshot(): AppSnapshot {
    return {
      schemaVersion: 1,
      profiles: this.profiles(),
      folders: this.folders(),
      bookmarks: this.bookmarks(),
      settings: this.settings(),
    };
  }

  private apply(snapshot: AppSnapshot): void {
    this.profiles.set(snapshot.profiles);
    this.folders.set(snapshot.folders);
    this.bookmarks.set(snapshot.bookmarks);
    this.settings.set(snapshot.settings);
  }

  private persist(): Promise<void> {
    return this.repository.save(this.snapshot());
  }
}
