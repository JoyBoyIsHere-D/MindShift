import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

interface OnboardingViewProps {
  hasUsagePermission: boolean;
  isServiceRunning: boolean;
  onRequestPermission: () => void;
  onToggleService: () => void;
  onProceedToDashboard: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  hasUsagePermission,
  isServiceRunning,
  onRequestPermission,
  onToggleService,
  onProceedToDashboard,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>BTP Research Phase 1: Data Collection</Text>
      </View>

      <Text style={styles.title}>MindShift Telemetry</Text>
      <Text style={styles.subtitle}>
        Digital Self-Control Behavioral Data Collection Prototype
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Academic Research Scope</Text>
        <Text style={styles.cardBody}>
          This application is designed specifically for an academic Bachelor Thesis Project.
          The objective of this stage is purely observational:
        </Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletPoint}>
            • Tracks foreground usage duration of targeted social media apps.
          </Text>
          <Text style={styles.bulletPoint}>
            • Records launch frequencies and session velocities (RESUMED/PAUSED events).
          </Text>
          <Text style={styles.bulletPoint}>
            • Zero active interventions or machine learning models in this phase.
          </Text>
          <Text style={styles.bulletPoint}>
            • No personal messages, credentials, screen content, or keystrokes are accessed.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Required Permissions & Service</Text>
        
        {/* Permission Row */}
        <View style={styles.statusRow}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>Usage Access (AppOps)</Text>
            <Text style={styles.statusDesc}>
              Allows querying Android's UsageStatsManager for app open/close times.
            </Text>
          </View>
          <View
            style={[
              styles.pill,
              hasUsagePermission ? styles.pillActive : styles.pillInactive,
            ]}
          >
            <Text style={styles.pillText}>
              {hasUsagePermission ? 'Granted' : 'Needed'}
            </Text>
          </View>
        </View>

        {!hasUsagePermission ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onRequestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Grant Usage Access in Settings</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.successNote}>
            <Text style={styles.successNoteText}>✓ Usage access is active</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Foreground Service Row */}
        <View style={styles.statusRow}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>Persistent Telemetry Service</Text>
            <Text style={styles.statusDesc}>
              Background polling service (Android 14+ specialUse) logging to local SQLite.
            </Text>
          </View>
          <View
            style={[
              styles.pill,
              isServiceRunning ? styles.pillActive : styles.pillInactive,
            ]}
          >
            <Text style={styles.pillText}>
              {isServiceRunning ? 'Running' : 'Stopped'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            !hasUsagePermission && styles.disabledButton,
          ]}
          onPress={onToggleService}
          disabled={!hasUsagePermission}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>
            {isServiceRunning ? 'Stop Telemetry Service' : 'Start Telemetry Service'}
          </Text>
        </TouchableOpacity>
      </View>

      {hasUsagePermission && (
        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={onProceedToDashboard}
          activeOpacity={0.8}
        >
          <Text style={styles.dashboardButtonText}>Open Live Dashboard →</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  headerBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginBottom: 20,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 20,
    marginBottom: 8,
  },
  bulletList: {
    marginTop: 4,
  },
  bulletPoint: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  statusInfo: {
    flex: 1,
    marginRight: 12,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  statusDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  pillInactive: {
    backgroundColor: '#450A0A',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 14,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.4,
  },
  successNote: {
    marginTop: 6,
    paddingVertical: 4,
  },
  successNoteText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardButton: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  dashboardButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

