import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native Android / iOS app shell. The game itself is the same build as the web
 * test version (`npm run build` → dist/); `npx cap sync` copies it into the
 * native projects in android/ and ios/. See docs/NATIVE.md.
 */
const config: CapacitorConfig = {
  appId: 'com.ugultu.game',
  appName: 'UĞULTU',
  webDir: 'dist',
  backgroundColor: '#050607',
  android: {
    backgroundColor: '#050607',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#050607',
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#050607',
      showSpinner: false,
    },
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
  },
};

export default config;
