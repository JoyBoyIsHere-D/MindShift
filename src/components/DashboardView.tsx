import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import {
  UsageStat,
  RawUsageEvent,
  getAppDisplayName,
  getAppColor,
  formatDuration,
} from '../native/TelemetryBridge';

interface DashboardViewProps {
  stats: UsageStat[];
  rawEvents: RawUsageEvent[];
  isLoading: boolean;
  onRefresh: () => void;
  onFetchRawEvents: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  rawEvents,
  isLoading,
  onRefresh,
  onFetchRawEvents,
}) => {
  const [activeTab, setActiveTab] = useState<'aggregated' | 'raw'>('aggregated');

  // Compute total foreground milliseconds
  const totalForegroundMillis = stats.reduce(
    (sum, item) => sum + item.totalTimeInForeground,
    0
  );

  // Maximum single app usage for relative percentage bars
  const maxUsageMillis = Math.max(
    ...stats.map((s) => s.totalTimeInForeground),
    1
  );

  const renderStatItem = ({ item }: { item: UsageStat }) => {
    const displayName = getAppDisplayName(item.packageName);
    const color = getAppColor(item.packageName);
    const percent = Math.min(
      100,
      Math.round((item.totalTimeInForeground / maxUsageMillis) * 100)
    );
    const lastUsedDate = item.lastTimeUsed > 0
      ? new Date(item.lastTimeUsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    return (
      <View style={styles.appCard}>
        <View style={styles.appHeader}>
          <View style={styles.appTitleContainer}>
            <View style={[styles.appDot, { backgroundColor: color }]} />
            <Text style={styles.appName}>{displayName}</Text>
          </View>
          <Text style={styles.appDuration}>
            {formatDuration(item.totalTimeInForeground)}
          </Text>
        </View>

        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${percent}%`, backgroundColor: color },
            ]}
          />
        </View>

        <View style={styles.appFooter}>
          <Text style={styles.appPackageText} numberOfLines={1}>
            {item.packageName}
          </Text>
          <Text style={styles.appLastUsedText}>
            Last: {lastUsedDate}
          </Text>
        </View>
      </View>
    );
  };

  const renderRawEventItem = ({ item }: { item: RawUsageEvent }) => {
    const isResumed = item.eventType === 1; // ACTIVITY_RESUMED
    const timeStr = new Date(item.timestamp).toLocaleTimeString();
    const displayName = getAppDisplayName(item.packageName);

    return (
      <View style={styles.rawCard}>
        <View style={styles.rawHeader}>
          <View
            style={[
              styles.eventBadge,
              isResumed ? styles.badgeResumed : styles.badgePaused,
            ]}
          >
            <Text style={styles.eventBadgeText}>
              {item.eventTypeName}
            </Text>
          </View>
          <Text style={styles.rawTimestamp}>{timeStr}</Text>
        </View>
        <Text style={styles.rawAppName}>{displayName}</Text>
        <Text style={styles.rawPackage} numberOfLines={1}>
          {item.packageName}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Overview Stat Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Today's Social Usage</Text>
            <Text style={styles.summaryValue}>
              {formatDuration(totalForegroundMillis)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.refreshButtonText}>↻ Refresh</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.summarySubtext}>
          Tracking {stats.length} active apps from Android UsageStatsManager
        </Text>
      </View>

      {/* Segmented Controls */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeTab === 'aggregated' && styles.segmentButtonActive,
          ]}
          onPress={() => setActiveTab('aggregated')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'aggregated' && styles.segmentTextActive,
            ]}
          >
            Aggregated Daily
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeTab === 'raw' && styles.segmentButtonActive,
          ]}
          onPress={() => {
            setActiveTab('raw');
            if (rawEvents.length === 0) {
              onFetchRawEvents();
            }
          }}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'raw' && styles.segmentTextActive,
            ]}
          >
            Raw State Log ({rawEvents.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content based on selected tab */}
      {activeTab === 'aggregated' ? (
        stats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Social Usage Recorded Today</Text>
            <Text style={styles.emptyText}>
              Launch target apps (Instagram, YouTube, etc.) and tap Refresh to view telemetry.
            </Text>
          </View>
        ) : (
          <FlatList
            data={stats}
            keyExtractor={(item) => item.packageName}
            renderItem={renderStatItem}
            contentContainerStyle={styles.listContent}
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.rawActionRow}>
            <Text style={styles.rawExplainer}>
              Chronological RESUMED & PAUSED events
            </Text>
            <TouchableOpacity
              onPress={onFetchRawEvents}
              style={styles.rawFetchBtn}
            >
              <Text style={styles.rawFetchText}>Reload Events</Text>
            </TouchableOpacity>
          </View>
          {rawEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Raw Events in Window</Text>
              <Text style={styles.emptyText}>
                Open and close social media apps to generate activity transitions.
              </Text>
            </View>
          ) : (
            <FlatList
              data={rawEvents}
              keyExtractor={(item, index) => `${item.packageName}-${item.timestamp}-${index}`}
              renderItem={renderRawEventItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginTop: 2,
  },
  summarySubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  refreshButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentButtonActive: {
    backgroundColor: '#334155',
  },
  segmentText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#F8FAFC',
  },
  listContent: {
    paddingBottom: 24,
  },
  appCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  appDuration: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38BDF8',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  appFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appPackageText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    marginRight: 8,
  },
  appLastUsedText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  rawActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rawExplainer: {
    fontSize: 12,
    color: '#94A3B8',
  },
  rawFetchBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rawFetchText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  rawCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#38BDF8',
  },
  rawHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeResumed: {
    backgroundColor: '#064E3B',
  },
  badgePaused: {
    backgroundColor: '#450A0A',
  },
  eventBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  rawTimestamp: {
    fontSize: 12,
    color: '#94A3B8',
  },
  rawAppName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  rawPackage: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});

