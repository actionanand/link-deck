# Security model

LinkDeck stores application data locally and does not use `localStorage` or `sessionStorage`.

## Application PIN

The application stores a PBKDF2-SHA-256 verifier with a random salt and 210,000 iterations. The PIN itself is not persisted. PIN input accepts 4 to 8 numeric digits.

## Android biometrics

Fingerprint login requires an application PIN and an enrolled Android strong biometric. Android Keystore encrypts the PIN with an authentication-bound AES key. The key is invalidated when biometric enrollment changes. Cancelling the Android prompt leaves LinkDeck locked and the PIN remains available.

## Backup encryption

Encrypted backups derive an AES-256-GCM key from the user passphrase using PBKDF2-SHA-256 with a random salt and 240,000 iterations. Every backup uses a fresh salt and IV.

## Signing credentials

Android release keystores and passwords are used only during CI signing. They must remain in GitHub Actions secrets and must never be committed or injected into the Angular application.
