import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.linkdeck.app',
  appName: 'LinkDeck',
  webDir: 'dist/link-deck/browser',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#0E1713' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: '#0E1713',
      showSpinner: false,
    },
  },
};

export default config;
