#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const appId = 'com.actionanand.linkdeck.app';
const res = resolve('android/app/src/main/res');
const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
const gradlePath = resolve('android/app/build.gradle');
const javaPath = resolve('android/app/src/main/java', ...appId.split('.'), 'MainActivity.java');

async function write(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

let manifest = await readFile(manifestPath, 'utf8');
if (!manifest.includes('android.permission.USE_BIOMETRIC')) {
  manifest = manifest.replace(
    '<application',
    '    <uses-permission android:name="android.permission.USE_BIOMETRIC" />\n\n    <application',
  );
}
manifest = manifest.replace(
  /(<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*android:theme=")[^"]*(")/,
  '$1@style/AppTheme.NoActionBarLaunch$2',
);
if (!manifest.includes('android.intent.action.SEND')) {
  manifest = manifest.replace(
    /(<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*>)/,
    `$1
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>`,
  );
}
await writeFile(manifestPath, manifest);

let gradle = await readFile(gradlePath, 'utf8');
if (!gradle.includes('androidx.biometric:biometric')) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    "dependencies {\n    implementation 'androidx.biometric:biometric:1.1.0'",
  );
}
await writeFile(gradlePath, gradle);

const styles = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">#087F5B</item>
        <item name="colorPrimaryDark">#0E1713</item>
        <item name="colorAccent">#52C995</item>
        <item name="android:fontFamily">sans</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:navigationBarColor">#0E1713</item>
        <item name="android:windowActionModeOverlay">true</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">#0E1713</item>
        <item name="android:statusBarColor">#0E1713</item>
        <item name="android:navigationBarColor">#0E1713</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#0E1713</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/link_deck_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>`;
await write(resolve(res, 'values/styles.xml'), styles);
await write(resolve(res, 'values-v31/styles.xml'), styles);
await write(
  resolve(res, 'drawable/link_deck_splash_icon.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:gravity="center" android:width="160dp" android:height="160dp" android:drawable="@drawable/link_deck_splash_logo" />
</layer-list>`,
);
await mkdir(resolve(res, 'drawable-nodpi'), { recursive: true });
await copyFile(
  resolve('public/link-deck.png'),
  resolve(res, 'drawable-nodpi/link_deck_splash_logo.png'),
);
await write(
  resolve(res, 'drawable/ic_stat_link_deck.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M6,2h9a3,3 0,0 1,3 3v17l-7.5,-4L3,22V5a3,3 0,0 1,3 -3z" />
</vector>`,
);

const mainActivity = `package ${appId};

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends BridgeActivity {
  private static final String KEY_ALIAS = "link_deck_biometric_key";
  private LinkDeckDatabase database;
  private boolean darkMode = true;
  private ImageView launchOverlay;
  private String sharedText = "";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    setTheme(R.style.AppTheme_NoActionBar);
    super.onCreate(savedInstanceState);
    database = new LinkDeckDatabase();
    getBridge().getWebView().setBackgroundColor(Color.parseColor("#0E1713"));
    getBridge().getWebView().addJavascriptInterface(database, "LinkDeckDatabase");
    getBridge().getWebView().addJavascriptInterface(new SystemBarsBridge(), "LinkDeckSystemBars");
    getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "LinkDeckNative");
    captureSharedText(getIntent());
    showLaunchOverlay();
    applySystemBars(true);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    captureSharedText(intent);
  }

  @Override
  protected void onResume() {
    super.onResume();
    applySystemBars(darkMode);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) applySystemBars(darkMode);
  }

  public class SystemBarsBridge {
    @JavascriptInterface
    public void setDarkMode(boolean enabled) {
      runOnUiThread(() -> applySystemBars(enabled));
    }
  }

  public class NativeBridge {
    @JavascriptInterface
    public void hideSplash() {
      runOnUiThread(() -> {
        if (launchOverlay != null) {
          ((FrameLayout) launchOverlay.getParent()).removeView(launchOverlay);
          launchOverlay = null;
          applySystemBars(darkMode);
        }
      });
    }

    @JavascriptInterface
    public boolean isBiometricAvailable() {
      return BiometricManager.from(MainActivity.this).canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_STRONG
      ) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @JavascriptInterface
    public void openUrl(String value) {
      runOnUiThread(() -> {
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(value)));
        } catch (Exception ignored) {}
      });
    }

    @JavascriptInterface
    public String consumeSharedText() {
      String value = sharedText;
      sharedText = "";
      return value;
    }

    @JavascriptInterface
    public void enableBiometric(String secret) {
      runOnUiThread(() -> {
        try {
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.ENCRYPT_MODE, createBiometricKey());
          showPrompt("Enable fingerprint login", "Confirm your fingerprint for LinkDeck", cipher, () -> {
            try {
              byte[] encrypted = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
              getPreferences(MODE_PRIVATE).edit()
                .putString("biometric_ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("biometric_iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
              dispatch("biometric-enabled", true, "", "");
            } catch (Exception error) {
              dispatch("biometric-enabled", false, "", error.getMessage());
            }
          }, "biometric-enabled");
        } catch (Exception error) {
          dispatch("biometric-enabled", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void authenticateBiometric() {
      runOnUiThread(() -> {
        try {
          String encodedIv = getPreferences(MODE_PRIVATE).getString("biometric_iv", "");
          String encodedValue = getPreferences(MODE_PRIVATE).getString("biometric_ciphertext", "");
          if (encodedIv.isEmpty() || encodedValue.isEmpty()) throw new IllegalStateException("Enable fingerprint login again.");
          KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
          keyStore.load(null);
          SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
          if (key == null) throw new IllegalStateException("Fingerprint credential was invalidated.");
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
          showPrompt("Unlock LinkDeck", "Use your fingerprint to continue", cipher, () -> {
            try {
              byte[] decrypted = cipher.doFinal(Base64.decode(encodedValue, Base64.NO_WRAP));
              dispatch("biometric-unlock", true, new String(decrypted, StandardCharsets.UTF_8), "");
            } catch (Exception error) {
              dispatch("biometric-unlock", false, "", error.getMessage());
            }
          }, "biometric-unlock");
        } catch (Exception error) {
          dispatch("biometric-unlock", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void disableBiometric() {
      getPreferences(MODE_PRIVATE).edit().remove("biometric_ciphertext").remove("biometric_iv").apply();
      try {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
      } catch (Exception ignored) {}
    }
  }

  public class LinkDeckDatabase extends SQLiteOpenHelper {
    LinkDeckDatabase() {
      super(MainActivity.this, "link-deck.db", null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
      db.execSQL("CREATE TABLE app_state (state_key TEXT PRIMARY KEY NOT NULL, json_value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
      db.execSQL("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)");
      db.execSQL("INSERT INTO schema_migrations(version, applied_at) VALUES(1, strftime('%s','now'))");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
      for (int version = oldVersion + 1; version <= newVersion; version++) {
        ContentValues migration = new ContentValues();
        migration.put("version", version);
        migration.put("applied_at", System.currentTimeMillis() / 1000);
        db.insert("schema_migrations", null, migration);
      }
    }

    @JavascriptInterface
    public String loadState() {
      try (Cursor cursor = getReadableDatabase().query("app_state", new String[]{"json_value"}, "state_key=?", new String[]{"snapshot"}, null, null, null)) {
        return cursor.moveToFirst() ? cursor.getString(0) : "";
      }
    }

    @JavascriptInterface
    public void saveState(String value) {
      ContentValues row = new ContentValues();
      row.put("state_key", "snapshot");
      row.put("json_value", value);
      row.put("updated_at", System.currentTimeMillis());
      getWritableDatabase().insertWithOnConflict("app_state", null, row, SQLiteDatabase.CONFLICT_REPLACE);
    }
  }

  private void showLaunchOverlay() {
    launchOverlay = new ImageView(this);
    launchOverlay.setImageResource(R.drawable.link_deck_splash_logo);
    launchOverlay.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
    launchOverlay.setPadding(96, 96, 96, 96);
    launchOverlay.setBackgroundColor(Color.parseColor("#0E1713"));
    addContentView(launchOverlay, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
  }

  private void captureSharedText(Intent intent) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
    if (!"text/plain".equals(intent.getType())) return;
    String value = intent.getStringExtra(Intent.EXTRA_TEXT);
    sharedText = value == null ? "" : value.trim();
  }

  private SecretKey createBiometricKey() throws Exception {
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
    }
    generator.init(builder.build());
    return generator.generateKey();
  }

  private void showPrompt(String title, String subtitle, Cipher cipher, Runnable success, String type) {
    Executor executor = ContextCompat.getMainExecutor(this);
    BiometricPrompt prompt = new BiometricPrompt(this, executor, new BiometricPrompt.AuthenticationCallback() {
      @Override
      public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
        success.run();
      }

      @Override
      public void onAuthenticationError(int errorCode, @NonNull CharSequence message) {
        dispatch(type, false, "", message.toString());
      }
    });
    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .setSubtitle(subtitle)
      .setNegativeButtonText("Use PIN")
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
      .build();
    prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
  }

  private void dispatch(String type, boolean success, String value, String error) {
    String script = "window.dispatchEvent(new CustomEvent('linkdeck-native-result',{detail:{type:" +
      quote(type) + ",success:" + success + ",value:" + quote(value) + ",error:" + quote(error == null ? "" : error) + "}}))";
    runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(script, null));
  }

  private String quote(String value) {
    return "\\"" + value.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n") + "\\"";
  }

  private void applySystemBars(boolean dark) {
    darkMode = dark;
    int color = Color.parseColor(dark ? "#0E1713" : "#F5F8F6");
    Window window = getWindow();
    window.setStatusBarColor(color);
    window.setNavigationBarColor(color);
    window.setBackgroundDrawableResource(dark ? android.R.color.black : android.R.color.white);
    getBridge().getWebView().setBackgroundColor(color);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = window.getInsetsController();
      if (controller != null) {
        int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        controller.setSystemBarsAppearance(dark ? 0 : light, light);
      }
    } else {
      int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
      if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      window.getDecorView().setSystemUiVisibility(flags);
    }
  }
}`;

await write(javaPath, mainActivity);
console.log(
  'Applied LinkDeck SQLite, biometric, splash, system-bar, share-target and notification patches.',
);
