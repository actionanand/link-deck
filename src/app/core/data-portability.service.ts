import { inject, Injectable } from '@angular/core';
import { AppSnapshot } from './models';
import { AppStore } from './app-store';

interface EncryptedBackup {
  readonly format: 'link-deck-backup';
  readonly version: 1;
  readonly encrypted: true;
  readonly createdAt: string;
  readonly iterations: number;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

interface PlainBackup {
  readonly format: 'link-deck-backup';
  readonly version: 1;
  readonly encrypted: false;
  readonly createdAt: string;
  readonly data: AppSnapshot;
}

interface BackupInput {
  readonly format?: string;
  readonly version?: number;
  readonly encrypted?: boolean;
  readonly createdAt?: string;
  readonly iterations?: number;
  readonly salt?: string;
  readonly iv?: string;
  readonly ciphertext?: string;
  readonly data?: AppSnapshot;
}

export interface ImportPreview {
  readonly bookmarks: number;
  readonly folders: number;
  readonly toolbarFolder: string | null;
  readonly duplicates: number;
}

export type DuplicatePolicy = 'skip' | 'replace' | 'merge' | 'keep-both';
const BACKUP_ITERATIONS = 240_000;

export function normalizeBookmarkUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a URL.');
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP and HTTPS links are supported.');
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  )
    url.port = '';
  return url.toString();
}

export function inspectNetscapeHtml(
  contents: string,
  existingUrls: ReadonlySet<string> = new Set(),
): ImportPreview {
  const document = new DOMParser().parseFromString(contents, 'text/html');
  const links = [...document.querySelectorAll('a[href]')];
  const folders = [...document.querySelectorAll('h3')];
  return {
    bookmarks: links.length,
    folders: folders.length,
    toolbarFolder:
      folders.find((folder) => folder.getAttribute('personal_toolbar_folder') === 'true')
        ?.textContent ?? null,
    duplicates: links.filter((link) =>
      existingUrls.has(normalizeBookmarkUrl(link.getAttribute('href') ?? '')),
    ).length,
  };
}

export function wrapNetscapeProfile(name: string, body: string, toolbar: boolean): string {
  const escapedName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>LinkDeck Bookmarks</TITLE>',
    '<H1>LinkDeck Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3${toolbar ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${escapedName}</H3>`,
    '    <DL><p>',
    body,
    '    </DL><p>',
    '</DL><p>',
  ].join('\n');
}

@Injectable({ providedIn: 'root' })
export class DataPortabilityService {
  private readonly store = inject(AppStore);

  async createBackup(passphrase = ''): Promise<void> {
    const createdAt = new Date().toISOString();
    const snapshot = this.store.snapshot();
    if (!passphrase) {
      const backup: PlainBackup = {
        format: 'link-deck-backup',
        version: 1,
        encrypted: false,
        createdAt,
        data: snapshot,
      };
      this.download(`link-deck-backup-${createdAt.slice(0, 10)}.json`, JSON.stringify(backup));
      return;
    }
    if (passphrase.length < 8) throw new Error('Use at least 8 characters for encryption.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt, BACKUP_ITERATIONS);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(snapshot)),
    );
    const backup: EncryptedBackup = {
      format: 'link-deck-backup',
      version: 1,
      encrypted: true,
      createdAt,
      iterations: BACKUP_ITERATIONS,
      salt: this.toBase64(salt),
      iv: this.toBase64(iv),
      ciphertext: this.toBase64(new Uint8Array(ciphertext)),
    };
    this.download(`link-deck-backup-${createdAt.slice(0, 10)}.linkdeck`, JSON.stringify(backup));
  }

  async restoreBackup(file: File, passphrase = ''): Promise<void> {
    const parsed = JSON.parse(await file.text()) as BackupInput;
    if (parsed.format !== 'link-deck-backup' || parsed.version !== 1) {
      throw new Error('This is not a supported LinkDeck backup.');
    }
    let snapshot: AppSnapshot;
    if (parsed.encrypted === false && parsed.data) {
      snapshot = parsed.data;
    } else if (
      parsed.encrypted === true &&
      parsed.salt &&
      parsed.iv &&
      parsed.ciphertext &&
      parsed.iterations
    ) {
      if (!passphrase) throw new Error('This backup is encrypted. Enter its passphrase.');
      try {
        const key = await this.deriveKey(
          passphrase,
          this.fromBase64(parsed.salt),
          parsed.iterations,
        );
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: this.fromBase64(parsed.iv) },
          key,
          this.fromBase64(parsed.ciphertext),
        );
        snapshot = JSON.parse(new TextDecoder().decode(plaintext)) as AppSnapshot;
      } catch {
        throw new Error('The passphrase is incorrect or the backup is damaged.');
      }
    } else {
      throw new Error('The backup contents are incomplete.');
    }
    this.validateSnapshot(snapshot);
    await this.store.replace(snapshot);
  }

  exportProfile(profileId: string, toolbar: boolean): void {
    const profile = this.store.profiles().find((item) => item.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    const body = this.renderFolderContents(profileId, null, '    ');
    const html = wrapNetscapeProfile(profile.name, body, toolbar);
    this.download(`${this.slug(profile.name)}-bookmarks.html`, html, 'text/html;charset=utf-8');
  }

  previewHtml(contents: string, profileId?: string): ImportPreview {
    const existing = new Set(
      this.store
        .bookmarks()
        .filter((bookmark) => !profileId || bookmark.profileId === profileId)
        .map((bookmark) => bookmark.url),
    );
    return inspectNetscapeHtml(contents, existing);
  }

  async importHtml(
    contents: string,
    target: { readonly profileId?: string; readonly profileName?: string },
    duplicatePolicy: DuplicatePolicy,
  ): Promise<ImportPreview> {
    const preview = this.previewHtml(contents, target.profileId);
    let profileId = target.profileId;
    if (!profileId) {
      await this.store.addProfile(target.profileName?.trim() || 'Imported bookmarks');
      profileId = this.store.profiles().at(-1)?.id;
    }
    if (!profileId) throw new Error('A destination profile is required.');
    const document = new DOMParser().parseFromString(contents, 'text/html');
    const root = document.querySelector('dl');
    if (!root) throw new Error('No Netscape bookmark structure was found.');
    await this.importList(root, profileId, null, duplicatePolicy);
    return preview;
  }

  normalizeUrl(value: string): string {
    return normalizeBookmarkUrl(value);
  }

  private async importList(
    list: Element,
    profileId: string,
    parentId: string | null,
    policy: DuplicatePolicy,
  ): Promise<void> {
    for (const child of [...list.children]) {
      if (child.tagName !== 'DT') continue;
      const folderHeading = child.querySelector(':scope > h3');
      const link = child.querySelector(':scope > a[href]');
      if (folderHeading) {
        const folder = await this.store.addFolder(
          folderHeading.textContent?.trim() || 'Untitled folder',
          profileId,
          parentId,
        );
        const nested = this.nextList(child);
        if (nested) await this.importList(nested, profileId, folder.id, policy);
      } else if (link) {
        const url = this.normalizeUrl(link.getAttribute('href') ?? '');
        const duplicate = this.store
          .bookmarks()
          .find((bookmark) => bookmark.profileId === profileId && bookmark.url === url);
        if (duplicate && policy === 'skip') continue;
        const title = link.textContent?.trim() || new URL(url).hostname;
        if (duplicate && (policy === 'replace' || policy === 'merge')) {
          await this.store.updateBookmark(duplicate.id, {
            title: policy === 'replace' ? title : duplicate.title || title,
            folderId: parentId,
          });
          continue;
        }
        await this.store.addBookmark({
          profileId,
          folderId: parentId,
          title,
          url,
          notes: '',
          tags: [],
        });
      }
    }
  }

  private nextList(element: Element): Element | null {
    let sibling = element.nextElementSibling;
    while (sibling && sibling.tagName === 'P') sibling = sibling.nextElementSibling;
    return sibling?.tagName === 'DL' ? sibling : element.querySelector(':scope > dl');
  }

  private renderFolderContents(profileId: string, parentId: string | null, indent: string): string {
    const folders = this.store
      .folders()
      .filter((folder) => folder.profileId === profileId && folder.parentId === parentId);
    const bookmarks = this.store
      .bookmarks()
      .filter(
        (bookmark) =>
          bookmark.profileId === profileId && bookmark.folderId === parentId && !bookmark.trashedAt,
      );
    const lines = bookmarks.map((bookmark) => {
      const timestamp = Math.floor(new Date(bookmark.createdAt).getTime() / 1000);
      return `${indent}<DT><A HREF="${this.escapeHtml(bookmark.url)}" ADD_DATE="${timestamp}"${bookmark.favicon ? ` ICON="${this.escapeHtml(bookmark.favicon)}"` : ''}>${this.escapeHtml(bookmark.title)}</A>`;
    });
    for (const folder of folders) {
      lines.push(`${indent}<DT><H3>${this.escapeHtml(folder.name)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      lines.push(this.renderFolderContents(profileId, folder.id, `${indent}    `));
      lines.push(`${indent}</DL><p>`);
    }
    return lines.filter(Boolean).join('\n');
  }

  private validateSnapshot(snapshot: AppSnapshot): void {
    if (
      snapshot.schemaVersion !== 1 ||
      !Array.isArray(snapshot.profiles) ||
      !Array.isArray(snapshot.folders) ||
      !Array.isArray(snapshot.bookmarks) ||
      !snapshot.settings ||
      snapshot.profiles.filter((profile) => profile.isDefault).length !== 1
    ) {
      throw new Error('The backup data is invalid.');
    }
  }

  private deriveKey(
    passphrase: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    return crypto.subtle
      .importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then((material) =>
        crypto.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
  }

  private download(fileName: string, contents: string, type = 'application/json'): void {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private slug(value: string): string {
    return (
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'profile'
    );
  }

  private toBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}
