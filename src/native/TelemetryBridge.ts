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

export interface UserGoal {
  packageName: string;
  baselineDailyMinutes: number; // L_0 in minutes
  decayRateLambda: number;      // lambda decay rate
  startDateEpochMs: number;
  enabled: boolean;
}

export interface ContextMetrics {
  packageName: string;
  mindlessnessScore: number;     // 0.0 to 1.0
  launchCount30m: number;
  sessionVelocityDwellMs: number;
  isRapidLoop: boolean;
  isDeepWorkHour: boolean;
  isLateNightHour: boolean;
  allowedLimitMinutes: number;   // L_t
  usedTodayMinutes: number;
  usageRatio: number;            // used / allowed
  triggerReason: string;
}

export interface MarkovTransition {
  fromPackage: string;
  toPackage: string;
  probability: number;
  count: number;
}

export interface InterventionLog {
  id: number;
  packageName: string;
  timestamp: number;
  interventionStage: number; // 1 to 4
  mindlessnessScore: number;
  userAction: string;        // "COMPLIED_CLOSED_APP" | "OVERRIDDEN" | "DISMISSED"
  synced: boolean;
}

export interface OverlayConfig {
  stage1Enabled: boolean;
  stage2Enabled: boolean;
  stage3Enabled: boolean;
  stage4Enabled: boolean;
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
  // =========================================================================
  // Usage Stats Module
  // =========================================================================
  async checkUsagePermission(): Promise<boolean> {
    assertAndroid();
    if (!UsageStatsModule) return false;
    return UsageStatsModule.checkUsagePermission();
  },

  async getInstalledTargetPackages(): Promise<string[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getInstalledTargetPackages();
  },

  async requestUsagePermission(): Promise<boolean> {
    assertAndroid();
    if (!UsageStatsModule) return false;
    return UsageStatsModule.requestUsagePermission();
  },

  async getTodayStats(): Promise<UsageStat[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getTodayStats();
  },

  async getAggregatedStats(startTime: number, endTime: number): Promise<UsageStat[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getAggregatedStats(startTime, endTime);
  },

  async getRawEvents(startTime: number, endTime: number): Promise<RawUsageEvent[]> {
    assertAndroid();
    if (!UsageStatsModule) return [];
    return UsageStatsModule.getRawEvents(startTime, endTime);
  },

  // =========================================================================
  // Service Bridge Module & System Overlay
  // =========================================================================
  async startService(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.startService();
  },

  async stopService(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.stopService();
  },

  async isServiceRunning(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.isServiceRunning();
  },

  async hasOverlayPermission(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.hasOverlayPermission();
  },

  async requestOverlayPermission(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.requestOverlayPermission();
  },

  // =========================================================================
  // User Goals & Context Engine
  // =========================================================================
  async getUserGoals(): Promise<UserGoal[]> {
    assertAndroid();
    if (!ServiceBridgeModule) return [];
    return ServiceBridgeModule.getUserGoals();
  },

  async saveUserGoal(
    packageName: string,
    baselineMinutes: number,
    decayRateLambda: number,
    enabled: boolean = true
  ): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.saveUserGoal(
      packageName,
      baselineMinutes,
      decayRateLambda,
      enabled
    );
  },

  async getContextMetrics(packageName: string): Promise<ContextMetrics> {
    assertAndroid();
    if (!ServiceBridgeModule) throw new Error('ServiceBridgeModule not linked');
    return ServiceBridgeModule.getContextMetrics(packageName);
  },

  async getTopTransitions(limit: number = 3): Promise<MarkovTransition[]> {
    assertAndroid();
    if (!ServiceBridgeModule) return [];
    return ServiceBridgeModule.getTopTransitions(limit);
  },

  async testTriggerOverlay(stage: number, packageName: string): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.testTriggerOverlay(stage, packageName);
  },

  async dismissOverlay(): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.dismissOverlay();
  },

  async getOverlayConfig(): Promise<OverlayConfig> {
    assertAndroid();
    if (!ServiceBridgeModule) {
      return { stage1Enabled: true, stage2Enabled: true, stage3Enabled: true, stage4Enabled: true };
    }
    return ServiceBridgeModule.getOverlayConfig();
  },

  async setOverlayStageEnabled(stage: number, enabled: boolean): Promise<boolean> {
    assertAndroid();
    if (!ServiceBridgeModule) return false;
    return ServiceBridgeModule.setOverlayStageEnabled(stage, enabled);
  },

  async getRecentInterventionLogs(limit: number = 20): Promise<InterventionLog[]> {
    assertAndroid();
    if (!ServiceBridgeModule) return [];
    return ServiceBridgeModule.getRecentInterventionLogs(limit);
  },

  // =========================================================================
  // Cloud Sync Module
  // =========================================================================
  async syncToCloud(): Promise<SyncResult> {
    assertAndroid();
    if (!SyncModule) throw new Error('SyncModule not linked');
    return SyncModule.syncToCloud();
  },

  async setSyncEndpoint(endpoint: string): Promise<boolean> {
    assertAndroid();
    if (!SyncModule) return false;
    return SyncModule.setSyncEndpoint(endpoint);
  },

  async getUnsyncedCount(): Promise<number> {
    assertAndroid();
    if (!SyncModule) return 0;
    return SyncModule.getUnsyncedCount();
  },

  async getTotalEventCount(): Promise<number> {
    assertAndroid();
    if (!SyncModule) return 0;
    return SyncModule.getTotalEventCount();
  },
};
