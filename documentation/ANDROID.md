# LinkDeck Android build guide

LinkDeck uses Capacitor and GitHub Actions to package the Angular application. The native `android/` project is generated in CI and patched after every Capacitor synchronization.

Android builds run only when:

- `main-android` is pushed;
- a `v*` release tag is pushed; or
- the **Android APK and AAB** workflow is started manually.

A push to `main` does not start an Android build.

## Build files

| File                                  | Purpose                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `capacitor.config.ts`                 | Application ID, name, web output, native background and splash configuration           |
| `.github/workflows/android-build.yml` | Quality checks, native generation, signing and artifact publishing                     |
| `android-version.json`                | Android `versionCode` and `versionName`                                                |
| `scripts/bump-android-version.js`     | Increments Android build and release versions                                          |
| `scripts/patch-android.mjs`           | Applies SQLite, biometric, splash, system-bar, share-target and notification resources |
| `scripts/generate-keystore.mjs`       | Creates the PKCS12 release keystore                                                    |
| `scripts/detect-keystore-format.mjs`  | Reports a keystore's internal format                                                   |
| `public/link-deck.png`                | Canonical launcher, splash, brand and Play Store image                                 |

## Local setup in WSL2

Install the Capacitor packages yourself:

```bash
npm i @capacitor/core@8.4.2 @capacitor/android@8.4.2
npm i -D @capacitor/cli@8.4.2
```

Create and synchronize the native project:

```bash
npm run build
npm run android:add
npm run android:sync
```

`android:sync` rebuilds the web app, runs `cap sync`, and reapplies the idempotent native patch.

## CI build flow

1. Install locked Angular dependencies with `npm ci`.
2. Install the pinned Capacitor build tools.
3. Run lint, unit tests and the production Angular build.
4. Increment `android-version.json` on `main-android`.
5. Generate and synchronize the Capacitor Android project.
6. Apply minimum SDK 24, target SDK 35 and the configured version values.
7. Generate launcher and Play Store images from `public/link-deck.png`.
8. Apply native LinkDeck patches.
9. Build a debug APK for `main-android`.
10. Build and sign an APK and AAB for `v*` tags.
11. Place output files in `release/` and upload them as workflow artifacts.

The workflow commits generated `main-android` artifacts back to `release/` with `[skip ci]`.

## Signing secrets

Add these under **Repository Settings → Secrets and variables → Actions**:

| Secret              | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `KEYSTORE_BASE64`   | Base64 text containing the release keystore                |
| `KEYSTORE_PASSWORD` | Keystore password                                          |
| `KEY_ALIAS`         | Signing alias; the included generator uses `linkdeck`      |
| `KEY_PASSWORD`      | Private-key password; for PKCS12 use the keystore password |

Generate the signing key in a trusted WSL2 shell:

```bash
npm run generate-keystore
test -s release-keystore.jks && base64 -w 0 release-keystore.jks > keystore.b64.txt
```

Keep the original keystore and passwords in a secure offline backup. Never commit either file.

## Versioning

```bash
npm run android:version
npm run android:version:patch
npm run android:version:minor
npm run android:version:major
```

`versionCode` must increase for every Play Console upload.

## Native behavior

The generated shell provides:

- SQLite storage with a `schema_migrations` table;
- Android Keystore-backed strong-biometric login with PIN fallback;
- system-browser URL opening;
- Android Share-menu URL intake for review in the bookmark editor;
- an Android 12+ launch theme and branded WebView transition;
- matching WebView, window, status-bar and navigation-bar colors;
- dark icons on light system bars and white icons on dark system bars;
- a white transparent notification icon named `ic_stat_link_deck`.

The mobile navigation drawer is inset from both Android safe areas and does not extend into the status or gesture-navigation regions.

## Device verification

Test a force-stopped cold launch on Android 12+ and one older supported version. Check portrait and landscape, all three themes, app resume, fingerprint cancellation, shared URLs, backup restore and system-browser opening. There must be no white flash, white edge segment, clipped brand image or mismatched system-bar icon color.

## Trigger from the Android branch

```bash
git checkout main-android
git merge main
git push origin main-android
```
