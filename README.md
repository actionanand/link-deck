# LinkDeck

LinkDeck is a mobile-first, offline bookmark manager built with Angular 22 and Capacitor. It keeps links in independent profiles with nested folders and stores data in IndexedDB in the browser or SQLite in the generated Android shell.

## Features

- Light, dark and system themes with Android status/navigation bar synchronisation
- Profiles, default profile, unlimited nested folders, bookmarks, favourites, tags and trash
- Universal search across bookmark, folder and profile metadata
- Chrome, Edge and Firefox-compatible Netscape Bookmark HTML import/export
- Complete encrypted or unencrypted backup and automatic restore format detection
- PBKDF2 PIN protection and Android Keystore-backed strong biometric login
- Android Share target and system-browser link opening
- Branded Android 12+ splash, launcher icon and white notification small icon
- GitHub Actions debug APK builds and signed APK/AAB builds for `v*` tags

No application data is written to `localStorage` or `sessionStorage`.

## Development

Use Node 24.15 or later:

```bash
npm ci
npm run develop
```

The development server is available at `http://localhost:3029`.

## Android prerequisites

The Android packages are intentionally not installed by this change. From WSL2, run:

```bash
npm i @capacitor/core@8.4.2 @capacitor/android@8.4.2
npm i -D @capacitor/cli@8.4.2
```

Then create or refresh the native project:

```bash
npm run android:add
npm run android:sync
```

`scripts/patch-android.mjs` is reapplied after every Capacitor sync. It installs the native SQLite bridge, strong-biometric bridge, branded splash, light/dark system-bar handling, share target and monochrome notification icon.

## Android signing and CI/CD

The workflow at `.github/workflows/android-build.yml`:

- runs lint, tests and the production Angular build;
- creates a debug APK on `main` and `main-android`;
- builds and signs an APK and AAB for `v*` tags;
- puts generated files in `release/`;
- uploads the folder as a workflow artifact and attaches tag builds to a GitHub release.

Configure these GitHub Actions secrets:

- `KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD` (not required when using the generated PKCS12 keystore)

Create a local PKCS12 signing key with:

```bash
npm run generate-keystore
base64 -w 0 release-keystore.jks > keystore.b64.txt
```

The generated key alias is `linkdeck`. Never commit the keystore or its passwords.

## Android theme and splash verification

Android system surfaces exist outside Angular, so CSS cannot control them. Verify a force-stopped cold launch on Android 12+ and one older supported version in portrait and landscape. Confirm that:

- the splash uses `public/link-deck.png` on `#0E1713` with no white flash or tile;
- dark mode uses white status and navigation icons;
- light mode uses dark icons;
- the WebView, window and gesture-navigation area share the same effective theme;
- automatic mode follows Android night mode after cold start and resume;
- fingerprint cancellation leaves LinkDeck locked and the PIN remains available.

## Backup formats

`.linkdeck` files use PBKDF2-SHA-256 and AES-256-GCM. The passphrase is not stored and cannot be recovered. Plain `.json` LinkDeck backups preserve the same application data without encryption. Restore accepts both formats.

Browser HTML is always unencrypted. It preserves folder hierarchy, titles, URLs, timestamps and favicons where browsers support them, but browser applications may discard LinkDeck-only fields such as notes, tags and visit history.
