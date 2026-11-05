import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vistaarone.superadmin',
  appName: 'VISTAAR Super Admin',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617'
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#10B981'
    }
  }
};

export default config;

