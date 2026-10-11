import { NativeModules, Platform } from 'react-native';

const { UsageStatsModule, ServiceBridgeModule, SyncModule } = NativeModules;

export interface UsageStat {
  packageName: string;
  totalTimeInForeground: number; // in milliseconds
  lastTimeUsed: number;          // epoch milliseconds
  firstTimestamp: number;
  lastTimestamp: number;
}

export interface RawUsageEvent {
  packageName: string;
  eventType: number;
  eventTypeName: 'ACTIVITY_RESUMED' | 'ACTIVITY_PAUSED';
  timestamp: number;
  className: string;
}

export interface SyncResult {
  syncedCount: number;
  success: boolean;
}

export interface AppMetadata {
  displayName: string;
  color: string;
}

export const KNOWN_PACKAGES: Record<string, AppMetadata> = {
  'com.instagram.android': { displayName: 'Instagram', color: '#E1306C' },
  'com.google.android.youtube': { displayName: 'YouTube', color: '#FF0000' },
  'com.twitter.android': { displayName: 'X / Twitter', color: '#1DA1F2' },
  'com.zhiliaoapp.musically': { displayName: 'TikTok', color: '#00F2FE' },
  'com.facebook.katana': { displayName: 'Facebook', color: '#1877F2' },
  'com.snapchat.android': { displayName: 'Snapchat', color: '#FFFC00' },
  'com.reddit.frontpage': { displayName: 'Reddit', color: '#FF4500' },
  'com.linkedin.android': { displayName: 'LinkedIn', color: '#0A66C2' },
  'org.telegram.messenger': { displayName: 'Telegram', color: '#24A1DE' },
  'com.whatsapp': { displayName: 'WhatsApp', color: '#25D366' },
};

export const getAppDisplayName = (packageName: string): string => {
  return KNOWN_PACKAGES[packageName]?.displayName || packageName.split('.').pop() || packageName;
};

export const getAppColor = (packageName: string): string => {
  return KNOWN_PACKAGES[packageName]?.color || '#607D8B';
};

export const formatDuration = (millis: number): string => {
  if (millis <= 0) return '0m';
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const assertAndroid = () => {
  if (Platform.OS !== 'android') {
    throw new Error('MindShift Telemetry modules are only available on Android.');
  }
};

export const TelemetryBridge = {
  /**
   * Checks if USAGE_STATS permission is granted via AppOpsManager
   */
  async checkUsagePermission(): Promise<boolean> {
    assertAndroid();
    if (!UsageStatsModule) {
      console.warn('UsageStatsModule is not linked.');
      return false;
    }
    return UsageStatsModule.checkUsagePermission();
  },

  /**
   * Opens the system Settings.ACTION_USAGE_ACCESS_SETTINGS screen
   */
  async requestUsagePermission(): Promise<boolean> {
    assertAndroid();
    if (!UsageStatsModule) {
      console.warn('UsageStatsModule is not linked.');
      return false;
    }
    return UsageStatsModule.requestUsagePermission();
  },

  /**
   * Returns aggregated usage statistics for today (midnight to now)
   */
  async getTodayStats(): Promise<UsageStat[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getTodayStats();
  },

  /**
   * Returns aggregated usage statistics for custom window
   */
  async getAggregatedStats(startTime: number, endTime: number): Promise<UsageStat[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getAggregatedStats(startTime, endTime);
  },

  /**
   * Returns chronological ACTIVITY_RESUMED & ACTIVITY_PAUSED events
   */
  async getRawEvents(startTime: number, endTime: number): Promise<RawUsageEvent[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getRawEvents(startTime, endTime);
  },

  /**
   * Starts the persistent foreground service (Android 14+ specialUse)
   */
  async startService(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.startService();
  },

  /**
   * Stops the foreground service
   */
  async stopService(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.stopService();
  },

  /**
   * Checks if foreground service is actively running
   */
  async isServiceRunning(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.isServiceRunning();
  },

  /**
   * Syncs unsynced local events to cloud REST endpoint
   */
  async syncToCloud(): Promise<SyncResult> {
    assertAndroid();
    if (!SyncModule) throw new Error('SyncModule not linked');
    return SyncModule.syncToCloud();
  },

  /**
   * Configures custom REST sync endpoint URL
   */
  async setSyncEndpoint(endpoint: string): Promise<boolean> {
    assertAndroid();
    if (!SyncModule) return false;
    return SyncModule.setSyncEndpoint(endpoint);
  },

  /**
   * Returns count of unsynced rows in Room DB
   */
  async getUnsyncedCount(): Promise<number> {
    assertAndroid();
    if (!SyncModule) return 0;
    return SyncModule.getUnsyncedCount();
  },

  /**
   * Returns total event count in Room DB
   */
  async getTotalEventCount(): Promise<number> {
    assertAndroid();
    if (!SyncModule) return 0;
    return SyncModule.getTotalEventCount();
  },
};
