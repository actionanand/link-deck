export type ThemePreference = 'light' | 'dark' | 'system';
export type ViewMode = 'list' | 'grid';

export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface Folder {
  readonly id: string;
  readonly profileId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly sortOrder: number;
}

export interface Bookmark {
  readonly id: string;
  readonly profileId: string;
  readonly folderId: string | null;
  readonly title: string;
  readonly url: string;
  readonly description: string;
  readonly notes: string;
  readonly tags: readonly string[];
  readonly favourite: boolean;
  readonly favicon: string;
  readonly archived: boolean;
  readonly trashedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string | null;
  readonly visitCount: number;
  readonly sortOrder: number;
}

export interface AppSettings {
  readonly theme: ThemePreference;
  readonly viewMode: ViewMode;
  readonly pinEnabled: boolean;
  readonly pinSalt?: string;
  readonly pinVerifier?: string;
  readonly pinIterations?: number;
  readonly biometricEnabled: boolean;
}

export interface AppSnapshot {
  readonly schemaVersion: 1;
  readonly profiles: readonly Profile[];
  readonly folders: readonly Folder[];
  readonly bookmarks: readonly Bookmark[];
  readonly settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  viewMode: 'grid',
  pinEnabled: false,
  biometricEnabled: false,
};

export function createInitialSnapshot(): AppSnapshot {
  return {
    schemaVersion: 1,
    profiles: [{ id: crypto.randomUUID(), name: 'Personal', isDefault: true, sortOrder: 0 }],
    folders: [],
    bookmarks: [],
    settings: DEFAULT_SETTINGS,
  };
}
