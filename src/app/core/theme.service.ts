import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { ThemePreference } from './models';

interface SystemBarsBridge {
  setDarkMode(enabled: boolean): void;
}

interface NativeWindow extends Window {
  LinkDeckSystemBars?: SystemBarsBridge;
  LinkDeckNative?: { hideSplash(): void };
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  private preference: ThemePreference = 'system';

  constructor() {
    this.media?.addEventListener('change', () => this.apply(this.preference));
  }

  apply(preference: ThemePreference): void {
    this.preference = preference;
    const dark = preference === 'dark' || (preference === 'system' && Boolean(this.media?.matches));
    this.document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    (this.document.defaultView as NativeWindow | null)?.LinkDeckSystemBars?.setDarkMode(dark);
  }

  hideNativeSplash(): void {
    (this.document.defaultView as NativeWindow | null)?.LinkDeckNative?.hideSplash();
  }
}
