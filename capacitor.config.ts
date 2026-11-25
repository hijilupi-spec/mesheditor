import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mesheditor.app',
  appName: 'Mesh Editor',
  webDir: 'dist',
  android: {
    backgroundColor: '#0d1117',
    // Allow the bundled WebView to call the on-device Codex CLI bridge over loopback HTTP.
    allowMixedContent: true,
  },
};

export default config;
