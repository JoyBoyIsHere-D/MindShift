import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';

interface SyncControlsViewProps {
  unsyncedCount: number;
  totalCount: number;
  isSyncing: boolean;
  lastSyncResult: string | null;
  onTriggerSync: () => void;
  onRefreshCounts: () => void;
}

export const SyncControlsView: React.FC<SyncControlsViewProps> = ({
  unsyncedCount,
  totalCount,
  isSyncing,
  lastSyncResult,
  onTriggerSync,
  onRefreshCounts,
}) => {
  const [showPayloadSchema, setShowPayloadSchema] = useState(false);

  const handleSyncPress = () => {
    if (unsyncedCount === 0) {
      Alert.alert(
        'Queue Empty',
        'No unsynced events in local SQLite. The background service records events every 5 minutes.'
      );
      return;
    }
    onTriggerSync();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Cloud Database Sync</Text>
      <Text style={styles.subtitle}>
        Batch pushes locally stored SQLite telemetry events to the research Node.js/MongoDB backend.
      </Text>

      {/* Metrics Row */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Local Events</Text>
          <Text style={styles.metricValue}>{totalCount}</Text>
          <Text style={styles.metricSub}>Recorded in Room DB</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pending Sync</Text>
          <Text style={[styles.metricValue, { color: unsyncedCount > 0 ? '#F59E0B' : '#10B981' }]}>
            {unsyncedCount}
          </Text>
          <Text style={styles.metricSub}>Waiting for upload</Text>
        </View>
      </View>

      {/* Sync Action Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Manual Sync Dispatch</Text>
        <Text style={styles.cardBody}>
          Events are uploaded in batches of 100 via HTTP POST. Once the server confirms receipt (HTTP 200), each event is flagged as synced in SQLite to prevent duplicate entries.
        </Text>

        <TouchableOpacity
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={handleSyncPress}
          disabled={isSyncing}
          activeOpacity={0.8}
        >
          {isSyncing ? (
            <View style={styles.buttonLoadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.syncButtonText}>Pushing Batches to Cloud...</Text>
            </View>
          ) : (
            <Text style={styles.syncButtonText}>
              ☁ Sync Now ({unsyncedCount} Pending)
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.refreshCountsBtn}
          onPress={onRefreshCounts}
        >
          <Text style={styles.refreshCountsText}>↻ Refresh Local Counts</Text>
        </TouchableOpacity>

        {lastSyncResult && (
          <View style={styles.statusBox}>
            <Text style={styles.statusBoxText}>{lastSyncResult}</Text>
          </View>
        )}
      </View>

      {/* Schema / REST Protocol Card */}
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.schemaToggleHeader}
          onPress={() => setShowPayloadSchema(!showPayloadSchema)}
        >
          <Text style={styles.cardHeader}>REST API & Payload Schema</Text>
          <Text style={styles.schemaToggleIcon}>
            {showPayloadSchema ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.cardBody}>
          Target: <Text style={styles.codeText}>POST /api/telemetry/sync</Text>
        </Text>

        {showPayloadSchema && (
          <View style={styles.codeBlock}>
            <Text style={styles.codeContent}>
{`{
  "events": [
    {
      "packageName": "com.instagram.android",
      "eventType": "ACTIVITY_RESUMED",
      "timestamp": 1728654321000,
      "duration": 0,
      "recordedAt": 1728654325000
    },
    {
      "packageName": "com.instagram.android",
      "eventType": "ACTIVITY_PAUSED",
      "timestamp": 1728654441000,
      "duration": 0,
      "recordedAt": 1728654445000
    }
  ]
}`}
            </Text>
          </View>
        )}
      </View>

      {/* Background Service Auto-Sync Notice */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Service Polling Note</Text>
        <Text style={styles.infoText}>
          The background service writes to local SQLite every 5 minutes. If no social media apps were opened, no new rows are created.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
    lineHeight: 20,
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricLabel: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  cardBody: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 14,
  },
  syncButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshCountsBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  refreshCountsText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  statusBox: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusBoxText: {
    color: '#F8FAFC',
    fontSize: 12,
  },
  schemaToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  schemaToggleIcon: {
    color: '#94A3B8',
    fontSize: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    color: '#38BDF8',
  },
  codeBlock: {
    backgroundColor: '#0B1120',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  codeContent: {
    color: '#34D399',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
});

