import { inject, Injectable } from '@angular/core';
import { AppStore } from './app-store';

const PIN_ITERATIONS = 210_000;

interface NativeBridge {
  isBiometricAvailable(): boolean;
  enableBiometric(secret: string): void;
  authenticateBiometric(): void;
  disableBiometric(): void;
}

interface NativeResult {
  readonly type: string;
  readonly success: boolean;
  readonly value?: string;
  readonly error?: string;
}

interface NativeWindow extends Window {
  LinkDeckNative?: NativeBridge;
}

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private readonly store = inject(AppStore);

  async enablePin(pin: string): Promise<void> {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Use a numeric PIN with 4 to 8 digits.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await this.derive(pin, salt);
    await this.store.updateSettings({
      pinEnabled: true,
      pinSalt: this.toBase64(salt),
      pinVerifier: this.toBase64(verifier),
      pinIterations: PIN_ITERATIONS,
    });
    this.store.locked.set(false);
  }

  async disablePin(pin: string): Promise<void> {
    if (!(await this.verify(pin))) throw new Error('The PIN is incorrect.');
    this.native()?.disableBiometric();
    await this.store.updateSettings({
      pinEnabled: false,
      pinSalt: undefined,
      pinVerifier: undefined,
      pinIterations: undefined,
      biometricEnabled: false,
    });
    this.store.locked.set(false);
  }

  async unlock(pin: string): Promise<boolean> {
    const valid = await this.verify(pin);
    if (valid) this.store.locked.set(false);
    return valid;
  }

  lock(): void {
    if (this.store.settings().pinEnabled) this.store.locked.set(true);
  }

  biometricAvailable(): boolean {
    return Boolean(this.native()?.isBiometricAvailable());
  }

  async enableBiometric(pin: string): Promise<void> {
    if (!(await this.verify(pin))) throw new Error('The PIN is incorrect.');
    const native = this.native();
    if (!native) throw new Error('Biometric login is available in the Android app.');
    await this.waitForNative('biometric-enabled', () => native.enableBiometric(pin));
    await this.store.updateSettings({ biometricEnabled: true });
  }

  async unlockWithBiometric(): Promise<void> {
    const native = this.native();
    if (!native) throw new Error('Biometric login is available in the Android app.');
    const pin = await this.waitForNative('biometric-unlock', () => native.authenticateBiometric());
    if (!(await this.unlock(pin)))
      throw new Error('The saved biometric credential is no longer valid.');
  }

  private async verify(pin: string): Promise<boolean> {
    const settings = this.store.settings();
    if (!settings.pinEnabled || !settings.pinSalt || !settings.pinVerifier) return true;
    const actual = await this.derive(pin, this.fromBase64(settings.pinSalt));
    const expected = this.fromBase64(settings.pinVerifier);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1)
      difference |= actual[index] ^ expected[index];
    return difference === 0;
  }

  private async derive(
    pin: string,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pin),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS },
        material,
        256,
      ),
    );
  }

  private native(): NativeBridge | undefined {
    return (window as NativeWindow).LinkDeckNative;
  }

  private waitForNative(type: string, action: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Android did not respond.')),
        60_000,
      );
      const listener = (event: Event): void => {
        const detail = (event as CustomEvent<NativeResult>).detail;
        if (detail.type !== type) return;
        window.clearTimeout(timeout);
        window.removeEventListener('linkdeck-native-result', listener);
        if (detail.success) resolve(detail.value ?? '');
        else reject(new Error(detail.error || 'Biometric authentication failed.'));
      };
      window.addEventListener('linkdeck-native-result', listener);
      action();
    });
  }

  private toBase64(value: Uint8Array): string {
    return btoa(String.fromCharCode(...value));
  }

  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}
