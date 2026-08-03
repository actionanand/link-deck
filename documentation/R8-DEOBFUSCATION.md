# Android R8 and deobfuscation files

## Play Console warning

Google Play can report that no deobfuscation file is associated with an App Bundle. This warning
does not prevent installation or release, but obfuscated crash and ANR stack traces are harder to
diagnose without the exact mapping file from that build.

## LinkDeck release optimization

LinkDeck generates its Android project in CI. After Capacitor synchronization,
scripts/patch-android.mjs enables this release configuration:

    release {
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }

R8 removes unreachable native code, optimizes bytecode and obfuscates Java symbols. Resource
shrinking removes resources that become unreachable. Obfuscation is not encryption.

## Native bridge keep rule

LinkDeck calls native Android methods from its WebView by runtime name. The patch therefore adds:

    -keepclassmembers class * {
        @android.webkit.JavascriptInterface <methods>;
    }

This prevents R8 from removing or renaming annotated bridge methods while allowing other native
code to be optimized.

## Mapping preservation

Every optimized release must generate:

    android/app/build/outputs/mapping/release/mapping.txt

CI requires that file to be non-empty and copies it to:

    release/link-deck-<version>-mapping.txt

It is committed with main-android release artifacts, uploaded as a GitHub Actions artifact and
attached to tagged GitHub Releases. A mapping belongs to one exact versionCode and must never be
used for another build.

Current Android Gradle Plugin bundle tasks normally embed mapping metadata in the AAB so Google
Play can associate it automatically. The standalone copy remains available for manual upload and
long-term crash analysis.

## Verify in Play Console

1. Open Test and release, then App bundle explorer.
2. Select the exact LinkDeck version and versionCode.
3. Open its downloads or assets section.
4. If no ReTrace mapping is associated, upload the matching mapping file from release.

## Local verification

After generating and patching Android:

    cd android
    ./gradlew bundleRelease
    test -s app/build/outputs/mapping/release/mapping.txt

Retain each published version's mapping while that version is supported. The file contains no
signing passwords or user data, but it does reveal original Java symbol names.
