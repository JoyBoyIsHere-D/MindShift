import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import {
  TelemetryBridge,
  ContextMetrics,
  MarkovTransition,
  UserGoal,
  OverlayConfig,
  KNOWN_PACKAGES,
  getAppDisplayName,
  getAppColor,
  formatDuration,
} from '../native/TelemetryBridge';

export const GoalsAndContextView: React.FC = () => {
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>('com.whatsapp');
  const [metrics, setMetrics] = useState<ContextMetrics | null>(null);
  const [transitions, setTransitions] = useState<MarkovTransition[]>([]);
  const [goals, setGoals] = useState<Record<string, UserGoal>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Overlay Intervention Granular Opt-In / Opt-Out Toggles
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    stage1Enabled: true,
    stage2Enabled: true,
    stage3Enabled: true,
    stage4Enabled: true,
  });

  // Edit Goal Form states
  const [baselineInput, setBaselineInput] = useState<string>('45');
  const [lambdaInput, setLambdaInput] = useState<string>('0.02');
  const [isSavingGoal, setIsSavingGoal] = useState<boolean>(false);

  // 1. Initial discovery of actually installed target packages on this device
  useEffect(() => {
    const discoverInstalled = async () => {
      try {
        const pkgs = await TelemetryBridge.getInstalledTargetPackages();
        if (pkgs && pkgs.length > 0) {
          setInstalledPackages(pkgs);
          setSelectedPackage(pkgs[0]);
        } else {
          const allKnown = Object.keys(KNOWN_PACKAGES);
          setInstalledPackages(allKnown);
          setSelectedPackage(allKnown[0]);
        }
      } catch (e: any) {
        console.warn('Error fetching installed packages:', e?.message);
        setInstalledPackages(Object.keys(KNOWN_PACKAGES));
      }
    };
    discoverInstalled();
  }, []);

  // 2. Load metrics for the chosen package
  const loadData = useCallback(async (pkg: string) => {
    if (!pkg) return;
    setIsLoading(true);
    try {
      // 1. Package-specific context metrics
      const m = await TelemetryBridge.getContextMetrics(pkg);
      setMetrics(m);

      // 2. Markov transitions
      const t = await TelemetryBridge.getTopTransitions(4);
      setTransitions(t);

      // 3. User goals
      const gList = await TelemetryBridge.getUserGoals();
      const gMap: Record<string, UserGoal> = {};
      gList.forEach((g) => {
        gMap[g.packageName] = g;
      });
      setGoals(gMap);

      const currentGoal = gMap[pkg];
      if (currentGoal) {
        setBaselineInput(currentGoal.baselineDailyMinutes.toString());
        setLambdaInput(currentGoal.decayRateLambda.toString());
      } else {
        setBaselineInput('45');
        setLambdaInput('0.02');
      }
      // 4. Overlay Config
      const cfg = await TelemetryBridge.getOverlayConfig();
      if (cfg) setOverlayConfig(cfg);
    } catch (e: any) {
      console.warn('Error loading context metrics:', e?.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPackage) {
      loadData(selectedPackage);
    }
  }, [selectedPackage, loadData]);

  const handleToggleStage = async (stage: number, value: boolean) => {
    setOverlayConfig((prev) => {
      switch (stage) {
        case 1:
          return { ...prev, stage1Enabled: value };
        case 2:
          return { ...prev, stage2Enabled: value };
        case 3:
          return { ...prev, stage3Enabled: value };
        case 4:
          return { ...prev, stage4Enabled: value };
        default:
          return prev;
      }
    });

    try {
      await TelemetryBridge.setOverlayStageEnabled(stage, value);
    } catch (e: any) {
      Alert.alert('Settings Error', e?.message || 'Failed to update overlay stage toggle.');
      const cfg = await TelemetryBridge.getOverlayConfig();
      if (cfg) setOverlayConfig(cfg);
    }
  };

  const handleSaveGoal = async () => {
    const baseline = parseFloat(baselineInput);
    const lambda = parseFloat(lambdaInput);

    if (isNaN(baseline) || baseline <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid positive baseline in minutes.');
      return;
    }
    if (isNaN(lambda) || lambda < 0 || lambda > 1) {
      Alert.alert('Invalid Input', 'Decay lambda must be between 0.0 and 1.0 (e.g. 0.02).');
      return;
    }

    setIsSavingGoal(true);
    try {
      await TelemetryBridge.saveUserGoal(selectedPackage, baseline, lambda, true);
      Alert.alert('Goal Saved', `Exponential decay baseline updated for ${getAppDisplayName(selectedPackage)}.`);
      loadData(selectedPackage);
    } catch (e: any) {
      Alert.alert('Save Error', e?.message || 'Failed to save goal.');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleTestOverlay = async (stage: number) => {
    try {
      const hasPermission = await TelemetryBridge.hasOverlayPermission();
      if (!hasPermission) {
        Alert.alert(
          'Overlay Permission Required',
          'Please enable "Display over other apps" in Settings to test native overlays.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => TelemetryBridge.requestOverlayPermission() },
          ]
        );
        return;
      }

      await TelemetryBridge.testTriggerOverlay(stage, selectedPackage);
    } catch (e: any) {
      Alert.alert('Overlay Error', e?.message || 'Failed to trigger test overlay.');
    }
  };

  const handleDismissOverlay = async () => {
    try {
      await TelemetryBridge.dismissOverlay();
    } catch (e: any) {
      console.warn('Error dismissing overlay:', e?.message);
    }
  };

  const score = metrics?.mindlessnessScore ?? 0.0;
  const scorePercent = Math.round(score * 100);
  const scoreColor =
    score >= 0.75 ? '#EF4444' : score >= 0.55 ? '#F59E0B' : score >= 0.35 ? '#38BDF8' : '#10B981';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Context Engine & Escalation</Text>
          <Text style={styles.subtitle}>
            App-specific behavioral scoring, velocity detection, and adaptive limits.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => loadData(selectedPackage)}
          activeOpacity={0.7}
        >
          <Text style={styles.refreshBtnText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Package Selector Pills: Only installed apps! */}
      <Text style={styles.sectionHeader}>Installed Social Media Apps:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.packageSelector}
        contentContainerStyle={styles.packageSelectorContent}
      >
        {installedPackages.map((pkg) => {
          const isSelected = pkg === selectedPackage;
          const color = getAppColor(pkg);
          return (
            <TouchableOpacity
              key={pkg}
              style={[
                styles.packagePill,
                isSelected && { borderColor: color, backgroundColor: 'rgba(56, 189, 248, 0.2)' },
              ]}
              onPress={() => setSelectedPackage(pkg)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.packagePillText,
                  isSelected && { color: '#FFFFFF', fontWeight: 'bold' },
                ]}
              >
                {getAppDisplayName(pkg)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loaderText}>Evaluating real-time behavioral features...</Text>
        </View>
      ) : (
        <>
          {/* Real-time Mindlessness Gauge Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeader}>
                {getAppDisplayName(selectedPackage)}: Intent Analysis
              </Text>
              <View style={[styles.scoreBadge, { backgroundColor: scoreColor }]}>
                <Text style={styles.scoreBadgeText}>{scorePercent}% Mindless</Text>
              </View>
            </View>

            {/* Score Bar */}
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, Math.max(5, scorePercent))}%`, backgroundColor: scoreColor },
                ]}
              />
            </View>

            <Text style={styles.reasonText}>
              <Text style={{ fontWeight: 'bold', color: '#F1F5F9' }}>Trigger Reason: </Text>
              {metrics?.triggerReason || 'Nominal intentional baseline'}
            </Text>

            {/* Metrics Breakdown Grid */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>{metrics?.launchCount30m ?? 0}</Text>
                <Text style={styles.metricLbl}>Launches (Last 30m)</Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>
                  {metrics?.sessionVelocityDwellMs && metrics.sessionVelocityDwellMs > 0
                    ? `${Math.round(metrics.sessionVelocityDwellMs / 1000)}s`
                    : 'None / First'}
                </Text>
                <Text style={styles.metricLbl}>Velocity / Reopen Dwell</Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={[styles.metricVal, { color: metrics?.isRapidLoop ? '#EF4444' : '#10B981' }]}>
                  {metrics?.isRapidLoop ? 'ACTIVE' : 'Normal'}
                </Text>
                <Text style={styles.metricLbl}>Markov Switching Loop</Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>
                  {metrics?.isDeepWorkHour ? 'Deep Work' : metrics?.isLateNightHour ? 'Late Night' : 'Standard'}
                </Text>
                <Text style={styles.metricLbl}>Circadian Vulnerability</Text>
              </View>
            </View>
          </View>

          {/* Exponential Decay Daily Allowance Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>
              Exponential Step-Down (L_t = L_0 · e^(-λ·t))
            </Text>
            <Text style={styles.cardSub}>
              Individualized daily limit decreases over time to guide behavioral reduction.
            </Text>

            <View style={styles.decayRow}>
              <View style={styles.decayCol}>
                <Text style={styles.decayVal}>
                  {metrics ? `${Math.round(metrics.allowedLimitMinutes)}m` : '45m'}
                </Text>
                <Text style={styles.decayLbl}>Today's Target (L_t)</Text>
              </View>
              <View style={styles.decayDivider} />
              <View style={styles.decayCol}>
                <Text style={[styles.decayVal, { color: '#38BDF8' }]}>
                  {metrics ? `${Math.round(metrics.usedTodayMinutes)}m` : '0m'}
                </Text>
                <Text style={styles.decayLbl}>Used Today</Text>
              </View>
              <View style={styles.decayDivider} />
              <View style={styles.decayCol}>
                <Text
                  style={[
                    styles.decayVal,
                    {
                      color:
                        (metrics?.usageRatio ?? 0) >= 1.0
                          ? '#EF4444'
                          : (metrics?.usageRatio ?? 0) >= 0.8
                          ? '#F59E0B'
                          : '#10B981',
                    },
                  ]}
                >
                  {metrics ? `${Math.round(metrics.usageRatio * 100)}%` : '0%'}
                </Text>
                <Text style={styles.decayLbl}>Ratio (Used / L_t)</Text>
              </View>
            </View>

            {/* Set Goal Input Fields */}
            <View style={styles.formRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>L_0 Baseline (Mins):</Text>
                <TextInput
                  style={styles.textInput}
                  value={baselineInput}
                  onChangeText={setBaselineInput}
                  keyboardType="numeric"
                  placeholder="45"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Decay Lambda λ (e.g. 0.02):</Text>
                <TextInput
                  style={styles.textInput}
                  value={lambdaInput}
                  onChangeText={setLambdaInput}
                  keyboardType="numeric"
                  placeholder="0.02"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.saveGoalBtn}
              onPress={handleSaveGoal}
              disabled={isSavingGoal}
              activeOpacity={0.8}
            >
              <Text style={styles.saveGoalBtnText}>
                {isSavingGoal ? 'Saving...' : `Update Exponential Goal for ${getAppDisplayName(selectedPackage)}`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Markov App-Switching Transitions Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Markov Switching Matrix (Last 24h)</Text>
            <Text style={styles.cardSub}>
              Detects high transition probabilities P(A ➔ B) between target apps.
            </Text>

            {transitions.length === 0 ? (
              <Text style={styles.emptyText}>
                No rapid cross-app transitions recorded yet. Launch and switch between social media apps to observe transitions.
              </Text>
            ) : (
              transitions.map((item, idx) => (
                <View key={idx} style={styles.transitionRow}>
                  <View style={styles.transitionNames}>
                    <Text style={styles.transitionFrom}>{getAppDisplayName(item.fromPackage)}</Text>
                    <Text style={styles.transitionArrow}>➔</Text>
                    <Text style={styles.transitionTo}>{getAppDisplayName(item.toPackage)}</Text>
                  </View>
                  <View style={styles.transitionMetrics}>
                    <Text style={styles.transitionProb}>
                      {(item.probability * 100).toFixed(0)}%
                    </Text>
                    <Text style={styles.transitionCount}>({item.count} switches)</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Granular Overlay Intervention Opt-In / Opt-Out Toggles */}
          <View style={styles.card}>
            <View style={styles.togglesHeaderRow}>
              <Text style={styles.cardHeader}>Overlay Intervention Toggles</Text>
              <View style={styles.optBadge}>
                <Text style={styles.optBadgeText}>CUSTOMIZE ESCALATION</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>
              Opt in or out of specific intervention overlays. When an overlay is disabled, MindShift gracefully steps down to lighter interventions or allows unhindered access.
            </Text>

            {/* Stage 1 Toggle */}
            <View style={styles.toggleItem}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleTitleRow}>
                  <View style={[styles.stageDot, { backgroundColor: '#38BDF8' }]} />
                  <Text style={styles.toggleTitle}>Stage 1: Ambient Floating Pill</Text>
                </View>
                <Text style={styles.toggleDesc}>
                  Non-blocking floating pill at top-right showing live session timer and daily % limit.
                </Text>
              </View>
              <Switch
                value={overlayConfig.stage1Enabled}
                onValueChange={(val) => handleToggleStage(1, val)}
                trackColor={{ false: '#334155', true: '#0284C7' }}
                thumbColor={overlayConfig.stage1Enabled ? '#38BDF8' : '#94A3B8'}
              />
            </View>

            <View style={styles.toggleDivider} />

            {/* Stage 2 Toggle */}
            <View style={styles.toggleItem}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleTitleRow}>
                  <View style={[styles.stageDot, { backgroundColor: '#2563EB' }]} />
                  <Text style={styles.toggleTitle}>Stage 2: Breathing Micro-Boundary</Text>
                </View>
                <Text style={styles.toggleDesc}>
                  6-second mindful breathing pause only on app launch with "Close App" & continue option.
                </Text>
              </View>
              <Switch
                value={overlayConfig.stage2Enabled}
                onValueChange={(val) => handleToggleStage(2, val)}
                trackColor={{ false: '#334155', true: '#1D4ED8' }}
                thumbColor={overlayConfig.stage2Enabled ? '#60A5FA' : '#94A3B8'}
              />
            </View>

            <View style={styles.toggleDivider} />

            {/* Stage 3 Toggle */}
            <View style={styles.toggleItem}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleTitleRow}>
                  <View style={[styles.stageDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.toggleTitle}>Stage 3: Friction Restraint (Phrase Typing)</Text>
                </View>
                <Text style={styles.toggleDesc}>
                  Requires accurately typing a mindful phrase on app launch before entering the app.
                </Text>
              </View>
              <Switch
                value={overlayConfig.stage3Enabled}
                onValueChange={(val) => handleToggleStage(3, val)}
                trackColor={{ false: '#334155', true: '#D97706' }}
                thumbColor={overlayConfig.stage3Enabled ? '#FBBF24' : '#94A3B8'}
              />
            </View>

            <View style={styles.toggleDivider} />

            {/* Stage 4 Toggle */}
            <View style={styles.toggleItem}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleTitleRow}>
                  <View style={[styles.stageDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.toggleTitle}>Stage 4: Hard Lockout Screen</Text>
                </View>
                <Text style={styles.toggleDesc}>
                  Strict lockout screen once today's exponential step-down limit (L_t) is exceeded.
                </Text>
              </View>
              <Switch
                value={overlayConfig.stage4Enabled}
                onValueChange={(val) => handleToggleStage(4, val)}
                trackColor={{ false: '#334155', true: '#DC2626' }}
                thumbColor={overlayConfig.stage4Enabled ? '#F87171' : '#94A3B8'}
              />
            </View>
          </View>

          {/* Interactive Debug Card for BTP Evaluation & Testing */}
          <View style={[styles.card, styles.demoCard]}>
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>BTP EVALUATION & DEMONSTRATION</Text>
            </View>
            <Text style={styles.cardHeader}>Test 4-Stage Adaptive Overlays</Text>
            <Text style={styles.cardSub}>
              Directly trigger native Android system overlays to test and present each escalation tier for {getAppDisplayName(selectedPackage)}:
            </Text>

            <View style={styles.demoButtonsContainer}>
              <TouchableOpacity
                style={[styles.stageBtn, { backgroundColor: '#0284C7' }]}
                onPress={() => handleTestOverlay(1)}
                activeOpacity={0.8}
              >
                <View style={styles.stageBtnHeader}>
                  <Text style={styles.stageBtnTitle}>Stage 1: Ambient Pill</Text>
                  <Text style={[styles.stageStatusBadge, { color: overlayConfig.stage1Enabled ? '#38BDF8' : '#94A3B8' }]}>
                    {overlayConfig.stage1Enabled ? '● Active' : '○ Opted Out'}
                  </Text>
                </View>
                <Text style={styles.stageBtnDesc}>Floating top-right session timer & %</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.stageBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => handleTestOverlay(2)}
                activeOpacity={0.8}
              >
                <View style={styles.stageBtnHeader}>
                  <Text style={styles.stageBtnTitle}>Stage 2: Micro-Boundary</Text>
                  <Text style={[styles.stageStatusBadge, { color: overlayConfig.stage2Enabled ? '#60A5FA' : '#94A3B8' }]}>
                    {overlayConfig.stage2Enabled ? '● Active' : '○ Opted Out'}
                  </Text>
                </View>
                <Text style={styles.stageBtnDesc}>6s animated breathing pause</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.stageBtn, { backgroundColor: '#D97706' }]}
                onPress={() => handleTestOverlay(3)}
                activeOpacity={0.8}
              >
                <View style={styles.stageBtnHeader}>
                  <Text style={styles.stageBtnTitle}>Stage 3: Friction Task</Text>
                  <Text style={[styles.stageStatusBadge, { color: overlayConfig.stage3Enabled ? '#FBBF24' : '#94A3B8' }]}>
                    {overlayConfig.stage3Enabled ? '● Active' : '○ Opted Out'}
                  </Text>
                </View>
                <Text style={styles.stageBtnDesc}>Type mindful phrase to continue to app</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.stageBtn, { backgroundColor: '#DC2626' }]}
                onPress={() => handleTestOverlay(4)}
                activeOpacity={0.8}
              >
                <View style={styles.stageBtnHeader}>
                  <Text style={styles.stageBtnTitle}>Stage 4: Hard Lockout</Text>
                  <Text style={[styles.stageStatusBadge, { color: overlayConfig.stage4Enabled ? '#F87171' : '#94A3B8' }]}>
                    {overlayConfig.stage4Enabled ? '● Active' : '○ Opted Out'}
                  </Text>
                </View>
                <Text style={styles.stageBtnDesc}>Strict exponential limit lockout screen</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.dismissOverlayBtn}
              onPress={handleDismissOverlay}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissOverlayBtnText}>Dismiss Active Overlay</Text>
            </TouchableOpacity>
          </View>
        </>
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
    padding: 16,
    paddingBottom: 40,
  },
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  refreshBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  refreshBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  packageSelector: {
    marginBottom: 16,
  },
  packageSelectorContent: {
    paddingRight: 10,
  },
  packagePill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  packagePillText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  cardSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    marginBottom: 12,
    lineHeight: 16,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 10,
    backgroundColor: '#0F172A',
    borderRadius: 5,
    overflow: 'hidden',
    marginVertical: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  reasonText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  metricItem: {
    width: '50%',
    paddingVertical: 6,
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  metricLbl: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  decayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 10,
  },
  decayCol: {
    flex: 1,
    alignItems: 'center',
  },
  decayDivider: {
    width: 1,
    backgroundColor: '#334155',
  },
  decayVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  decayLbl: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  inputGroup: {
    flex: 1,
    marginRight: 8,
  },
  inputLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    fontSize: 13,
  },
  saveGoalBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  saveGoalBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  transitionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  transitionNames: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transitionFrom: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  transitionArrow: {
    color: '#38BDF8',
    marginHorizontal: 8,
    fontSize: 13,
  },
  transitionTo: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  transitionMetrics: {
    alignItems: 'flex-end',
  },
  transitionProb: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  transitionCount: {
    color: '#64748B',
    fontSize: 10,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  demoCard: {
    borderColor: '#38BDF8',
  },
  demoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0369A1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  demoBadgeText: {
    color: '#E0F2FE',
    fontSize: 10,
    fontWeight: 'bold',
  },
  demoButtonsContainer: {
    marginTop: 6,
  },
  togglesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optBadge: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  optBadgeText: {
    color: '#CCFBF1',
    fontSize: 9,
    fontWeight: 'bold',
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  toggleDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    lineHeight: 15,
  },
  toggleDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 2,
  },
  stageBtnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stageStatusBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  stageBtn: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  stageBtnTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stageBtnDesc: {
    color: '#E2E8F0',
    fontSize: 11,
    marginTop: 2,
  },
  dismissOverlayBtn: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  dismissOverlayBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  loaderContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loaderText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10,
  },
});
