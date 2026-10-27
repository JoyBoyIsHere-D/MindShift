import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Alert,
  Platform,
} from 'react-native';
import {
  TelemetryBridge,
  UsageStat,
  RawUsageEvent,
} from './native/TelemetryBridge';
import { OnboardingView } from './components/OnboardingView';
import { DashboardView } from './components/DashboardView';
import { GoalsAndContextView } from './components/GoalsAndContextView';
import { SyncControlsView } from './components/SyncControlsView';

type TabType = 'onboarding' | 'dashboard' | 'goals' | 'sync';

export default function App(): React.JSX.Element {
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [hasUsagePermission, setHasUsagePermission] = useState<boolean>(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState<boolean>(false);
  const [isServiceRunning, setIsServiceRunning] = useState<boolean>(false);
  const [todayStats, setTodayStats] = useState<UsageStat[]>([]);
  const [rawEvents, setRawEvents] = useState<RawUsageEvent[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [unsyncedCount, setUnsyncedCount] = useState<number>(0);
  const [totalEventCount, setTotalEventCount] = useState<number>(0);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // 1. Permission & Service Status Verification
  const verifyState = useCallback(async () => {
    try {
      const usageGranted = await TelemetryBridge.checkUsagePermission();
      setHasUsagePermission(usageGranted);

      const overlayGranted = await TelemetryBridge.hasOverlayPermission();
      setHasOverlayPermission(overlayGranted);

      const running = await TelemetryBridge.isServiceRunning();
      setIsServiceRunning(running);

      if (usageGranted && overlayGranted && !running) {
        try {
          await TelemetryBridge.startService();
          setIsServiceRunning(true);
        } catch (e: any) {
          console.warn('Auto-start service failed:', e?.message);
        }
      }

      if (usageGranted) {
        loadTodayStats();
      } else {
        setCurrentTab('onboarding');
      }

      loadDatabaseCounts();
    } catch (e: any) {
      console.warn('Error verifying state:', e?.message);
    }
  }, []);

  // 2. Fetch Today's Aggregated Usage Stats
  const loadTodayStats = async () => {
    setIsLoadingStats(true);
    try {
      const stats = await TelemetryBridge.getTodayStats();
      const sorted = [...stats].sort(
        (a, b) => b.totalTimeInForeground - a.totalTimeInForeground
      );
      setTodayStats(sorted);
    } catch (e: any) {
      console.warn('Error loading stats:', e?.message);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // 3. Fetch Raw Activity Resumed/Paused Events
  const loadRawEvents = async () => {
    try {
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000;
      const events = await TelemetryBridge.getRawEvents(startTime, endTime);
      setRawEvents([...events].reverse());
    } catch (e: any) {
      Alert.alert('Raw Events Error', e?.message || 'Failed to fetch raw events');
    }
  };

  // 4. Load SQLite Database Counts
  const loadDatabaseCounts = async () => {
    try {
      const unsynced = await TelemetryBridge.getUnsyncedCount();
      const total = await TelemetryBridge.getTotalEventCount();
      setUnsyncedCount(unsynced);
      setTotalEventCount(total);
    } catch (e: any) {
      console.warn('Error loading DB counts:', e?.message);
    }
  };

  // 5. Initial Mount & AppState Listeners
  useEffect(() => {
    verifyState();

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          verifyState();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [verifyState]);

  // Request Usage Access via Settings
  const handleRequestPermission = async () => {
    try {
      await TelemetryBridge.requestUsagePermission();
    } catch (e: any) {
      Alert.alert('Permission Error', e?.message || 'Could not open settings');
    }
  };

  // Request Overlay Permission via Settings
  const handleRequestOverlayPermission = async () => {
    try {
      await TelemetryBridge.requestOverlayPermission();
    } catch (e: any) {
      Alert.alert('Overlay Permission Error', e?.message || 'Could not open overlay settings');
    }
  };

  // Toggle Background Foreground Service
  const handleToggleService = async () => {
    try {
      if (isServiceRunning) {
        await TelemetryBridge.stopService();
        setIsServiceRunning(false);
        Alert.alert('Service Stopped', 'MindShift telemetry & context service stopped.');
      } else {
        await TelemetryBridge.startService();
        setIsServiceRunning(true);
        Alert.alert('Service Started', 'MindShift real-time context service is active.');
      }
    } catch (e: any) {
      Alert.alert('Service Error', e?.message || 'Failed to toggle service state');
    }
  };

  // Trigger Cloud Sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await TelemetryBridge.syncToCloud();
      setLastSyncResult(`Synced ${result.syncedCount} events successfully.`);
      loadDatabaseCounts();
    } catch (e: any) {
      setLastSyncResult(`Sync failed: ${e?.message || 'Network error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>MindShift</Text>
          <Text style={styles.appSubtitle}>BTP Phase 2 • Adaptive Overlays & Context Engine</Text>
        </View>

        {/* Live Service Indicator */}
        <TouchableOpacity
          style={styles.serviceStatusContainer}
          onPress={handleToggleService}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isServiceRunning ? '#10B981' : '#EF4444' },
            ]}
          />
          <Text style={styles.statusIndicatorText}>
            {isServiceRunning ? 'SERVICE ON' : 'SERVICE OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Tab Screen Content */}
      <View style={styles.body}>
        {currentTab === 'onboarding' && (
          <OnboardingView
            hasUsagePermission={hasUsagePermission}
            hasOverlayPermission={hasOverlayPermission}
            isServiceRunning={isServiceRunning}
            onRequestPermission={handleRequestPermission}
            onRequestOverlayPermission={handleRequestOverlayPermission}
            onToggleService={handleToggleService}
            onProceedToDashboard={() => setCurrentTab('dashboard')}
          />
        )}

        {currentTab === 'dashboard' && (
          <DashboardView
            stats={todayStats}
            rawEvents={rawEvents}
            isLoading={isLoadingStats}
            onRefresh={loadTodayStats}
            onFetchRawEvents={loadRawEvents}
          />
        )}

        {currentTab === 'goals' && (
          <GoalsAndContextView />
        )}

        {currentTab === 'sync' && (
          <SyncControlsView
            unsyncedCount={unsyncedCount}
            totalCount={totalEventCount}
            isSyncing={isSyncing}
            lastSyncResult={lastSyncResult}
            onTriggerSync={handleTriggerSync}
            onRefreshCounts={loadDatabaseCounts}
          />
        )}
      </View>

      {/* Bottom Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'onboarding' && styles.tabButtonActive]}
          onPress={() => setCurrentTab('onboarding')}
        >
          <Text style={[styles.tabText, currentTab === 'onboarding' && styles.tabTextActive]}>
            Perms
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'dashboard' && styles.tabButtonActive]}
          onPress={() => {
            setCurrentTab('dashboard');
            loadTodayStats();
          }}
        >
          <Text style={[styles.tabText, currentTab === 'dashboard' && styles.tabTextActive]}>
            Usage
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'goals' && styles.tabButtonActive]}
          onPress={() => setCurrentTab('goals')}
        >
          <Text style={[styles.tabText, currentTab === 'goals' && styles.tabTextActive]}>
            Context & Overlays
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'sync' && styles.tabButtonActive]}
          onPress={() => {
            setCurrentTab('sync');
            loadDatabaseCounts();
          }}
        >
          <Text style={[styles.tabText, currentTab === 'sync' && styles.tabTextActive]}>
            Sync {unsyncedCount > 0 ? `(${unsyncedCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  serviceStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.4,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
});
