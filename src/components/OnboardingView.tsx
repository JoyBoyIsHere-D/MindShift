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
  hasOverlayPermission: boolean;
  isServiceRunning: boolean;
  onRequestPermission: () => void;
  onRequestOverlayPermission: () => void;
  onToggleService: () => void;
  onProceedToDashboard: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  hasUsagePermission,
  hasOverlayPermission,
  isServiceRunning,
  onRequestPermission,
  onRequestOverlayPermission,
  onToggleService,
  onProceedToDashboard,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>BTP Research Phase 2: Context Engine & Overlays</Text>
      </View>

      <Text style={styles.title}>MindShift</Text>
      <Text style={styles.subtitle}>
        Adaptive Digital Self-Control & Contextual Behavioral Interventions
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Academic Research Scope</Text>
        <Text style={styles.cardBody}>
          MindShift monitors real-time session velocity, rapid switching loops, and exponential
          daily limits to deliver 4-stage adaptive escalation:
        </Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletPoint}>
            • Stage 1 (Ambient): Subtle floating awareness pill with session timer.
          </Text>
          <Text style={styles.bulletPoint}>
            • Stage 2 (Micro-Boundary): 6-second mindful breathing pause on rapid loops.
          </Text>
          <Text style={styles.bulletPoint}>
            • Stage 3 (Friction Restraint): Requires typing a mindful phrase to unlock.
          </Text>
          <Text style={styles.bulletPoint}>
            • Stage 4 (Hard Lock): Enforces daily exponential step-down targets.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Required Permissions & Service</Text>
        
        {/* 1. Usage Stats Permission */}
        <View style={styles.statusRow}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>1. Usage Access (AppOps)</Text>
            <Text style={styles.statusDesc}>
              Required to detect app launches, foreground durations, and switching loops.
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

        {/* 2. System Overlay Permission */}
        <View style={styles.statusRow}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>2. Display Over Other Apps</Text>
            <Text style={styles.statusDesc}>
              Required to present real-time Stage 1–4 intervention overlays over social media.
            </Text>
          </View>
          <View
            style={[
              styles.pill,
              hasOverlayPermission ? styles.pillActive : styles.pillInactive,
            ]}
          >
            <Text style={styles.pillText}>
              {hasOverlayPermission ? 'Granted' : 'Needed'}
            </Text>
          </View>
        </View>

        {!hasOverlayPermission ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onRequestOverlayPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Grant Overlay Permission in Settings</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.successNote}>
            <Text style={styles.successNoteText}>✓ System overlay permission active</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* 3. Foreground Service */}
        <View style={styles.statusRow}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>3. Context Engine Service</Text>
            <Text style={styles.statusDesc}>
              Fast 1.5s interactive detection loop + 5m persistent SQLite logging.
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
            (!hasUsagePermission || !hasOverlayPermission) && styles.disabledButton,
          ]}
          onPress={onToggleService}
          disabled={!hasUsagePermission || !hasOverlayPermission}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>
            {isServiceRunning ? 'Stop Context Engine Service' : 'Start Context Engine Service'}
          </Text>
        </TouchableOpacity>
      </View>

      {hasUsagePermission && hasOverlayPermission && (
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
    marginTop: 6,
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
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#475569',
  },
  secondaryButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.4,
  },
  successNote: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  successNoteText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  dashboardButton: {
    backgroundColor: '#0284C7',
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
