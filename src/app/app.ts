import { NgOptimizedImage } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from './core/app-store';
import {
  DataPortabilityService,
  DuplicatePolicy,
  ImportPreview,
} from './core/data-portability.service';
import { Bookmark, ThemePreference } from './core/models';
import { SecurityService } from './core/security.service';
import { ThemeService } from './core/theme.service';
import { SelectPicker, SelectPickerOption } from './shared/select-picker';

type Page =
  | 'bookmarks'
  | 'profiles'
  | 'favourites'
  | 'tags'
  | 'transfer'
  | 'trash'
  | 'information'
  | 'settings';
type Dialog =
  | 'bookmark'
  | 'folder'
  | 'profile'
  | 'backup'
  | 'restore'
  | 'import'
  | 'pin'
  | 'remove-pin'
  | 'biometric'
  | null;

interface NativeWindow extends Window {
  LinkDeckNative?: {
    openUrl(value: string): void;
    consumeSharedText(): string;
  };
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, NgOptimizedImage, SelectPicker],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(window:visibilitychange)': 'handleVisibility()',
  },
})
export class App {
  protected readonly store = inject(AppStore);
  protected readonly security = inject(SecurityService);
  private readonly theme = inject(ThemeService);
  protected readonly portability = inject(DataPortabilityService);

  protected readonly page = signal<Page>('bookmarks');
  protected readonly dialog = signal<Dialog>(null);
  protected readonly query = signal('');
  protected readonly allProfiles = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly showDrawer = signal(false);

  protected readonly bookmarkUrl = signal('');
  protected readonly bookmarkTitle = signal('');
  protected readonly bookmarkNotes = signal('');
  protected readonly bookmarkTags = signal('');
  protected readonly bookmarkProfileId = signal('');
  protected readonly bookmarkFolderId = signal<string | null>(null);
  protected readonly profileName = signal('');
  protected readonly folderName = signal('');
  protected readonly pin = signal('');
  protected readonly pinConfirmation = signal('');
  protected readonly passphrase = signal('');
  protected readonly encryptBackup = signal(true);
  protected readonly restoreFile = signal<File | null>(null);
  protected readonly importFile = signal<File | null>(null);
  protected readonly importContents = signal('');
  protected readonly importPreview = signal<ImportPreview | null>(null);
  protected readonly duplicatePolicy = signal<DuplicatePolicy>('skip');
  protected readonly importNewProfile = signal(true);

  protected readonly activeProfile = computed(() =>
    this.store.profiles().find((profile) => profile.id === this.store.selectedProfileId()),
  );
  protected readonly visibleFolders = computed(() =>
    this.store
      .folders()
      .filter(
        (folder) =>
          folder.profileId === this.store.selectedProfileId() &&
          folder.parentId === this.store.selectedFolderId(),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder),
  );
  protected readonly breadcrumbs = computed(() => {
    const values: { readonly id: string | null; readonly name: string }[] = [
      { id: null, name: this.activeProfile()?.name ?? 'Bookmarks' },
    ];
    let id = this.store.selectedFolderId();
    const parents = [];
    while (id) {
      const folder = this.store.folders().find((item) => item.id === id);
      if (!folder) break;
      parents.unshift({ id: folder.id, name: folder.name });
      id = folder.parentId;
    }
    return [...values, ...parents];
  });
  protected readonly visibleBookmarks = computed(() => {
    const query = this.query().trim().toLowerCase();
    const page = this.page();
    return this.store
      .bookmarks()
      .filter(
        (bookmark) => this.allProfiles() || bookmark.profileId === this.store.selectedProfileId(),
      )
      .filter(
        (bookmark) => this.allProfiles() || bookmark.folderId === this.store.selectedFolderId(),
      )
      .filter((bookmark) => (page === 'trash' ? Boolean(bookmark.trashedAt) : !bookmark.trashedAt))
      .filter((bookmark) => page !== 'favourites' || bookmark.favourite)
      .filter((bookmark) => page !== 'tags' || bookmark.tags.length > 0)
      .filter((bookmark) => {
        if (!query) return true;
        const profile =
          this.store.profiles().find((item) => item.id === bookmark.profileId)?.name ?? '';
        const folder =
          this.store.folders().find((item) => item.id === bookmark.folderId)?.name ?? '';
        return [
          profile,
          folder,
          bookmark.title,
          bookmark.url,
          bookmark.description,
          bookmark.notes,
          bookmark.tags.join(' '),
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
  protected readonly tagSummary = computed(() => {
    const counts = new Map<string, number>();
    for (const bookmark of this.store.bookmarks()) {
      if (bookmark.trashedAt) continue;
      for (const tag of bookmark.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  });
  protected readonly profileOptions = computed<readonly SelectPickerOption[]>(() =>
    this.store.profiles().map((profile) => ({
      value: profile.id,
      label: profile.name,
      detail: profile.isDefault
        ? 'Default profile'
        : `${this.profileBookmarkCount(profile.id)} bookmarks`,
      icon: profile.isDefault ? 'bookmark' : 'folder_special',
    })),
  );
  protected readonly folderOptions = computed<readonly SelectPickerOption[]>(() => [
    { value: '', label: 'Profile root', icon: 'home' },
    ...this.store
      .folders()
      .filter((folder) => folder.profileId === this.bookmarkProfileId())
      .map((folder) => ({ value: folder.id, label: folder.name, icon: 'folder' })),
  ]);
  protected readonly destinationOptions: readonly SelectPickerOption[] = [
    {
      value: 'new',
      label: 'New profile',
      detail: 'Create a separate imported profile',
      icon: 'create_new_folder',
    },
    {
      value: 'existing',
      label: 'Current profile',
      detail: 'Import into the selected profile',
      icon: 'folder_special',
    },
  ];
  protected readonly duplicateOptions: readonly SelectPickerOption[] = [
    { value: 'skip', label: 'Skip existing', detail: 'Keep current bookmarks unchanged' },
    { value: 'replace', label: 'Replace existing', detail: 'Use the imported title and folder' },
    { value: 'merge', label: 'Merge metadata', detail: 'Keep useful existing metadata' },
    { value: 'keep-both', label: 'Keep both', detail: 'Create another bookmark copy' },
  ];

  constructor() {
    void this.initialize();
    effect(() => this.theme.apply(this.store.settings().theme));
  }

  protected navigate(page: Page): void {
    this.page.set(page);
    this.showDrawer.set(false);
    this.store.selectedFolderId.set(null);
  }

  protected selectProfile(id: string): void {
    this.store.selectedProfileId.set(id);
    this.store.selectedFolderId.set(null);
    this.page.set('bookmarks');
  }

  protected profileBookmarkCount(profileId: string): number {
    return this.store
      .bookmarks()
      .filter((bookmark) => bookmark.profileId === profileId && !bookmark.trashedAt).length;
  }

  protected openAddBookmark(): void {
    const profileId = this.store.defaultProfile()?.id ?? this.store.selectedProfileId();
    this.bookmarkProfileId.set(profileId);
    this.bookmarkFolderId.set(
      profileId === this.store.selectedProfileId() ? this.store.selectedFolderId() : null,
    );
    this.bookmarkUrl.set('');
    this.bookmarkTitle.set('');
    this.bookmarkNotes.set('');
    this.bookmarkTags.set('');
    this.openDialog('bookmark');
  }

  protected async saveBookmark(): Promise<void> {
    this.error.set('');
    try {
      const url = this.portability.normalizeUrl(this.bookmarkUrl());
      const duplicate = this.store
        .bookmarks()
        .find(
          (bookmark) =>
            bookmark.profileId === this.bookmarkProfileId() &&
            bookmark.url === url &&
            !bookmark.trashedAt,
        );
      if (
        duplicate &&
        !window.confirm('This URL already exists in the profile. Save another copy?')
      ) {
        await this.openBookmark(duplicate);
        return;
      }
      const title = this.bookmarkTitle().trim() || new URL(url).hostname;
      const tags = [
        ...new Set(
          this.bookmarkTags()
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      await this.store.addBookmark({
        profileId: this.bookmarkProfileId(),
        folderId: this.bookmarkFolderId(),
        title,
        url,
        notes: this.bookmarkNotes().trim(),
        tags,
      });
      this.closeDialog();
      this.notify('Bookmark saved');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The bookmark could not be saved.');
    }
  }

  protected async pasteUrl(): Promise<void> {
    try {
      this.bookmarkUrl.set(await navigator.clipboard.readText());
    } catch {
      this.error.set('Clipboard access was not allowed.');
    }
  }

  protected async openBookmark(bookmark: Bookmark): Promise<void> {
    await this.store.updateBookmark(bookmark.id, {
      visitCount: bookmark.visitCount + 1,
      lastOpenedAt: new Date().toISOString(),
    });
    const native = (window as NativeWindow).LinkDeckNative;
    if (native) native.openUrl(bookmark.url);
    else window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  }

  protected toggleFavourite(bookmark: Bookmark): void {
    void this.store.updateBookmark(bookmark.id, { favourite: !bookmark.favourite });
  }

  protected moveToTrash(bookmark: Bookmark): void {
    void this.store.updateBookmark(bookmark.id, { trashedAt: new Date().toISOString() });
  }

  protected restoreBookmark(bookmark: Bookmark): void {
    void this.store.updateBookmark(bookmark.id, { trashedAt: null });
  }

  protected deletePermanently(bookmark: Bookmark): void {
    if (!window.confirm(`Permanently delete “${bookmark.title}”? This cannot be undone.`)) return;
    const snapshot = this.store.snapshot();
    void this.store.replace({
      ...snapshot,
      bookmarks: snapshot.bookmarks.filter((item) => item.id !== bookmark.id),
    });
  }

  protected async saveProfile(): Promise<void> {
    const name = this.profileName().trim();
    if (!name) {
      this.error.set('Enter a profile name.');
      return;
    }
    await this.store.addProfile(name);
    this.closeDialog();
    this.notify('Profile created');
  }

  protected async saveFolder(): Promise<void> {
    const name = this.folderName().trim();
    if (!name) {
      this.error.set('Enter a folder name.');
      return;
    }
    await this.store.addFolder(name, this.store.selectedProfileId(), this.store.selectedFolderId());
    this.closeDialog();
    this.notify('Folder created');
  }

  protected async makeDefaultProfile(profileId: string): Promise<void> {
    const snapshot = this.store.snapshot();
    await this.store.replace({
      ...snapshot,
      profiles: snapshot.profiles.map((profile) => ({
        ...profile,
        isDefault: profile.id === profileId,
      })),
    });
    this.notify('Default profile updated');
  }

  protected async duplicateProfile(profileId: string): Promise<void> {
    const source = this.store.profiles().find((profile) => profile.id === profileId);
    if (!source) return;
    const newId = crypto.randomUUID();
    const folderIds = new Map<string, string>();
    for (const folder of this.store.folders().filter((item) => item.profileId === profileId)) {
      folderIds.set(folder.id, crypto.randomUUID());
    }
    const snapshot = this.store.snapshot();
    await this.store.replace({
      ...snapshot,
      profiles: [
        ...snapshot.profiles,
        {
          ...source,
          id: newId,
          name: `${source.name} copy`,
          isDefault: false,
          sortOrder: snapshot.profiles.length,
        },
      ],
      folders: [
        ...snapshot.folders,
        ...snapshot.folders
          .filter((folder) => folder.profileId === profileId)
          .map((folder) => ({
            ...folder,
            id: folderIds.get(folder.id) ?? crypto.randomUUID(),
            profileId: newId,
            parentId: folder.parentId ? (folderIds.get(folder.parentId) ?? null) : null,
          })),
      ],
      bookmarks: [
        ...snapshot.bookmarks,
        ...snapshot.bookmarks
          .filter((bookmark) => bookmark.profileId === profileId)
          .map((bookmark) => ({
            ...bookmark,
            id: crypto.randomUUID(),
            profileId: newId,
            folderId: bookmark.folderId ? (folderIds.get(bookmark.folderId) ?? null) : null,
          })),
      ],
    });
    this.notify('Profile duplicated');
  }

  protected async renameProfile(profileId: string): Promise<void> {
    const profile = this.store.profiles().find((item) => item.id === profileId);
    if (!profile) return;
    const name = window.prompt('Rename profile', profile.name)?.trim();
    if (!name) return;
    const snapshot = this.store.snapshot();
    await this.store.replace({
      ...snapshot,
      profiles: snapshot.profiles.map((item) => (item.id === profileId ? { ...item, name } : item)),
    });
  }

  protected async deleteProfile(profileId: string): Promise<void> {
    const profile = this.store.profiles().find((item) => item.id === profileId);
    if (!profile) return;
    if (profile.isDefault) {
      window.alert('Choose another default profile before deleting this one.');
      return;
    }
    const choice = window
      .prompt(
        'Profile deletion options:\nType EXPORT to export and delete, MOVE to move content to another profile, DELETE to delete permanently, or Cancel.',
      )
      ?.trim()
      .toLowerCase();
    if (!choice) return;
    if (choice === 'export') this.portability.exportProfile(profileId, false);
    const snapshot = this.store.snapshot();
    if (choice === 'move') {
      const targets = snapshot.profiles.filter((item) => item.id !== profileId);
      const targetName = window.prompt(
        `Move content to which profile?\n${targets.map((item) => item.name).join(', ')}`,
      );
      const target = targets.find(
        (item) => item.name.toLowerCase() === targetName?.trim().toLowerCase(),
      );
      if (!target) {
        window.alert('No matching destination profile was found.');
        return;
      }
      await this.store.replace({
        ...snapshot,
        profiles: snapshot.profiles.filter((item) => item.id !== profileId),
        folders: snapshot.folders.map((item) =>
          item.profileId === profileId ? { ...item, profileId: target.id } : item,
        ),
        bookmarks: snapshot.bookmarks.map((item) =>
          item.profileId === profileId ? { ...item, profileId: target.id } : item,
        ),
      });
      this.notify('Profile content moved');
      return;
    }
    if (!['export', 'delete'].includes(choice)) return;
    if (!window.confirm(`Delete "${profile.name}" and all of its content permanently?`)) return;
    await this.store.replace({
      ...snapshot,
      profiles: snapshot.profiles.filter((item) => item.id !== profileId),
      folders: snapshot.folders.filter((item) => item.profileId !== profileId),
      bookmarks: snapshot.bookmarks.filter((item) => item.profileId !== profileId),
    });
    this.notify('Profile deleted');
  }

  protected async reorderProfile(profileId: string, direction: -1 | 1): Promise<void> {
    const profiles = [...this.store.profiles()].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    const index = profiles.findIndex((profile) => profile.id === profileId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= profiles.length) return;
    [profiles[index], profiles[targetIndex]] = [profiles[targetIndex], profiles[index]];
    const snapshot = this.store.snapshot();
    await this.store.replace({
      ...snapshot,
      profiles: profiles.map((item, sortOrder) => ({ ...item, sortOrder })),
    });
  }

  protected selectTheme(theme: ThemePreference): void {
    void this.store.updateSettings({ theme });
  }

  protected async savePin(): Promise<void> {
    this.error.set('');
    if (this.pin() !== this.pinConfirmation()) {
      this.error.set('The PINs do not match.');
      return;
    }
    try {
      await this.security.enablePin(this.pin());
      this.closeDialog();
      this.notify('PIN protection enabled');
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'PIN protection could not be enabled.',
      );
    }
  }

  protected async removePin(): Promise<void> {
    try {
      await this.security.disablePin(this.pin());
      this.closeDialog();
      this.notify('PIN protection removed');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The PIN could not be removed.');
    }
  }

  protected async unlock(): Promise<void> {
    if (await this.security.unlock(this.pin())) {
      this.pin.set('');
      this.error.set('');
    } else {
      this.error.set('Incorrect PIN.');
    }
  }

  protected async biometric(action: 'enable' | 'unlock'): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      if (action === 'enable') {
        await this.security.enableBiometric(this.pin());
        this.closeDialog();
        this.notify('Fingerprint login enabled');
      } else {
        await this.security.unlockWithBiometric();
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Biometric authentication failed.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async createBackup(): Promise<void> {
    try {
      await this.portability.createBackup(this.encryptBackup() ? this.passphrase() : '');
      this.closeDialog();
      this.notify(this.encryptBackup() ? 'Encrypted backup created' : 'Backup created');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Backup could not be created.');
    }
  }

  protected selectRestoreFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.restoreFile.set(input.files?.[0] ?? null);
    this.passphrase.set('');
    this.openDialog('restore');
    input.value = '';
  }

  protected async restoreBackup(): Promise<void> {
    const file = this.restoreFile();
    if (!file) return;
    try {
      await this.portability.restoreBackup(file, this.passphrase());
      this.closeDialog();
      this.notify('Backup restored');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Backup could not be restored.');
    }
  }

  protected exportProfile(toolbar: boolean): void {
    this.portability.exportProfile(this.store.selectedProfileId(), toolbar);
    this.notify('Browser bookmark file exported');
  }

  protected async selectImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const contents = await file.text();
    this.importFile.set(file);
    this.importContents.set(contents);
    this.importPreview.set(this.portability.previewHtml(contents, this.store.selectedProfileId()));
    this.openDialog('import');
    input.value = '';
  }

  protected async importBookmarks(): Promise<void> {
    try {
      const target = this.importNewProfile()
        ? { profileName: this.importFile()?.name.replace(/\.[^.]+$/, '') }
        : { profileId: this.store.selectedProfileId() };
      await this.portability.importHtml(this.importContents(), target, this.duplicatePolicy());
      this.closeDialog();
      this.notify('Bookmarks imported');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Bookmarks could not be imported.');
    }
  }

  protected openDialog(dialog: Exclude<Dialog, null>): void {
    this.error.set('');
    this.pin.set('');
    this.pinConfirmation.set('');
    this.dialog.set(dialog);
  }

  protected closeDialog(): void {
    this.dialog.set(null);
    this.error.set('');
  }

  protected chooseFile(input: HTMLInputElement): void {
    input.click();
  }

  protected handleVisibility(): void {
    if (document.visibilityState === 'hidden') this.security.lock();
  }

  private async initialize(): Promise<void> {
    try {
      await this.store.initialize();
      this.theme.apply(this.store.settings().theme);
      const sharedText = (window as NativeWindow).LinkDeckNative?.consumeSharedText().trim();
      const sharedUrl = sharedText?.match(/https?:\/\/[^\s]+/i)?.[0] ?? sharedText;
      if (sharedUrl) {
        this.openAddBookmark();
        this.bookmarkUrl.set(sharedUrl);
      }
    } finally {
      this.theme.hideNativeSplash();
    }
  }

  private notify(value: string): void {
    this.message.set(value);
    window.setTimeout(() => this.message.set(''), 2500);
  }
}
