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
} from 'react-native';
import {
  TelemetryBridge,
  UsageStat,
  RawUsageEvent,
} from './native/TelemetryBridge';
import { OnboardingView } from './components/OnboardingView';
import { DashboardView } from './components/DashboardView';
import { SyncControlsView } from './components/SyncControlsView';

type TabType = 'onboarding' | 'dashboard' | 'sync';

export default function App(): React.JSX.Element {
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [hasUsagePermission, setHasUsagePermission] = useState<boolean>(false);
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
      const granted = await TelemetryBridge.checkUsagePermission();
      setHasUsagePermission(granted);

      const running = await TelemetryBridge.isServiceRunning();
      setIsServiceRunning(running);

      if (granted) {
        loadTodayStats();
      } else {
        // If permission is not granted, guide the user to Onboarding tab
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
      // Sort in descending order of foreground duration
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
      // Last 24 hours
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000;
      const events = await TelemetryBridge.getRawEvents(startTime, endTime);
      // Newest events first
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

    // Re-check when app regains focus (e.g. after returning from Android Settings)
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

  // Toggle Background Foreground Service
  const handleToggleService = async () => {
    try {
      if (isServiceRunning) {
        await TelemetryBridge.stopService();
        setIsServiceRunning(false);
        Alert.alert('Service Stopped', 'Background telemetry service is now inactive.');
      } else {
        await TelemetryBridge.startService();
        setIsServiceRunning(true);
        Alert.alert(
          'Service Started',
          'Persistent telemetry is running with notification: "Telemetry active for BTP".'
        );
      }
    } catch (e: any) {
      Alert.alert('Service Error', e?.message || 'Failed to toggle service');
    }
  };

  // Trigger Manual Cloud Sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await TelemetryBridge.syncToCloud();
      setLastSyncResult(
        `✓ Sync completed: ${result.syncedCount} events successfully uploaded to cloud.`
      );
      await loadDatabaseCounts();
    } catch (e: any) {
      const errorMsg = e?.message || 'Cloud sync failed. Check network or server URL.';
      setLastSyncResult(`✗ Sync failed: ${errorMsg}`);
      Alert.alert('Sync Error', errorMsg);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top App Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>MindShift</Text>
          <Text style={styles.appSubtitle}>BTP Telemetry Engine</Text>
        </View>

        <View style={styles.serviceStatusContainer}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isServiceRunning ? '#10B981' : '#EF4444' },
            ]}
          />
          <Text style={styles.statusIndicatorText}>
            {isServiceRunning ? 'SERVICE ACTIVE' : 'SERVICE OFF'}
          </Text>
        </View>
      </View>

      {/* Main View Area */}
      <View style={styles.body}>
        {currentTab === 'onboarding' && (
          <OnboardingView
            hasUsagePermission={hasUsagePermission}
            isServiceRunning={isServiceRunning}
            onRequestPermission={handleRequestPermission}
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
            Setup & Perms
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
            Dashboard
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
            Cloud Sync {unsyncedCount > 0 ? `(${unsyncedCount})` : ''}
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
    fontSize: 11,
    color: '#94A3B8',
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
    paddingHorizontal: 12,
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
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
});

