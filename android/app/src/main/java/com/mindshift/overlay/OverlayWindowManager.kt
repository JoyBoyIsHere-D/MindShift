package com.mindshift.overlay

import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.inputmethod.InputMethodManager
import android.widget.*
import com.mindshift.data.InterventionLogEntity
import com.mindshift.data.TelemetryDatabase
import com.mindshift.engine.InterventionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Native System Overlay Window Manager for MindShift.
 * Displays 4-Stage Adaptive Escalation Overlays using TYPE_APPLICATION_OVERLAY:
 * - Stage 1: Ambient non-blocking floating pill at top-right with usage % & timer
 * - Stage 2: Micro-Boundary with a 6-second breathing pause & mindful choice buttons
 * - Stage 3: Progressive Friction task requiring typing a 25-character mindfulness sentence
 * - Stage 4: Strict lockout screen showing Exponential Decay limit trajectory
 */
class OverlayWindowManager(private val context: Context) {

    companion object {
        const val TAG = "OverlayWindowManager"

        @Volatile
        private var instance: OverlayWindowManager? = null

        fun getInstance(context: Context): OverlayWindowManager {
            return instance ?: synchronized(this) {
                val inst = OverlayWindowManager(context.applicationContext)
                instance = inst
                inst
            }
        }

        val MINDFUL_PHRASES = listOf(
            "I choose mindful presence",
            "Pause before you scroll",
            "Notice the urge to scroll",
            "Is this serving me now?",
            "Breathe before you consume"
        )
    }

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.IO)

    // State tracking
    @Volatile
    var activeOverlayPackage: String? = null
        private set

    @Volatile
    var isManualTest: Boolean = false
        private set

    private var currentOverlayView: View? = null
    private var stage1TimerRunnable: Runnable? = null
    private var breathingCountdownRunnable: Runnable? = null
    private var breathingAnimator: ValueAnimator? = null

    /**
     * Display the specified intervention stage overlay.
     */
    fun showOverlay(
        stage: Int,
        packageName: String,
        mindlessnessScore: Double,
        triggerReason: String,
        usageRatio: Double = 0.0,
        limitMs: Long = 0L,
        usedMs: Long = 0L,
        isManual: Boolean = false
    ) {
        if (!Settings.canDrawOverlays(context)) {
            Log.w(TAG, "Cannot show overlay: SYSTEM_ALERT_WINDOW permission not granted")
            return
        }

        mainHandler.post {
            // Dismiss previous overlay synchronously before attaching new one
            dismissInternal()

            activeOverlayPackage = packageName
            isManualTest = isManual

            try {
                when (stage) {
                    1 -> showStage1AmbientPill(packageName, usageRatio)
                    2 -> showStage2MicroBoundary(packageName, mindlessnessScore, triggerReason)
                    3 -> showStage3FrictionTask(packageName, mindlessnessScore, triggerReason)
                    4 -> showStage4HardLock(packageName, mindlessnessScore, limitMs, usedMs)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error displaying overlay stage $stage: ${e.message}", e)
            }
        }
    }

    /**
     * Dismiss any currently visible overlay safely.
     */
    fun dismissCurrentOverlay() {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            dismissInternal()
        } else {
            mainHandler.post { dismissInternal() }
        }
    }

    /**
     * Dismisses the overlay if the active package is no longer the foreground app.
     * Manual tests are not dismissed by app switches.
     */
    fun dismissIfPackageNotActive(currentForegroundPackage: String?) {
        if (isManualTest) {
            // In manual test mode, keep overlay open for developer demonstration
            return
        }

        val active = activeOverlayPackage ?: return
        if (currentForegroundPackage != active) {
            Log.d(TAG, "Target app $active no longer in foreground (now: $currentForegroundPackage). Dismissing overlay.")
            dismissCurrentOverlay()
        }
    }

    private fun dismissInternal() {
        stage1TimerRunnable?.let { mainHandler.removeCallbacks(it) }
        stage1TimerRunnable = null

        breathingCountdownRunnable?.let { mainHandler.removeCallbacks(it) }
        breathingCountdownRunnable = null

        breathingAnimator?.cancel()
        breathingAnimator = null

        val view = currentOverlayView
        if (view != null) {
            try {
                if (view.isAttachedToWindow) {
                    windowManager.removeView(view)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error removing overlay view: ${e.message}")
            }
        }
        currentOverlayView = null
        activeOverlayPackage = null
        isManualTest = false
    }

    // =========================================================================
    // STAGE 1: Ambient Awareness Floating Pill (Non-blocking)
    // =========================================================================
    private fun showStage1AmbientPill(packageName: String, usageRatio: Double) {
        val appName = getAppShortName(packageName)
        val percent = (usageRatio * 100).toInt().coerceAtMost(999)

        val pillLayout = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(24).toFloat()
                setColor(Color.parseColor("#EE0F172A")) // Slate 900 93% opacity
                setStroke(dp(1), Color.parseColor("#38BDF8")) // Sky blue accent
            }
            elevation = dp(8).toFloat()
        }

        // Dot indicator
        val dot = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(dp(8), dp(8)).apply {
                marginEnd = dp(8)
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(if (percent >= 80) Color.parseColor("#F59E0B") else Color.parseColor("#10B981"))
            }
        }
        pillLayout.addView(dot)

        // Text: "Instagram: 65% • 01:23"
        val sessionStart = System.currentTimeMillis()
        val textView = TextView(context).apply {
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            text = "$appName: ${percent}% • 00:00"
        }
        pillLayout.addView(textView)

        // Close button
        val closeBtn = TextView(context).apply {
            text = "  ✕"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(4), dp(2), dp(4), dp(2))
            setOnClickListener {
                logIntervention(packageName, 1, 0.40, "DISMISSED")
                dismissCurrentOverlay()
            }
        }
        pillLayout.addView(closeBtn)

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(16)
            y = dp(70) // Below status bar
        }

        windowManager.addView(pillLayout, layoutParams)
        currentOverlayView = pillLayout

        // Update session timer every second
        stage1TimerRunnable = object : Runnable {
            override fun run() {
                val elapsedSec = ((System.currentTimeMillis() - sessionStart) / 1000).toInt()
                val min = elapsedSec / 60
                val sec = elapsedSec % 60
                val timeStr = String.format("%02d:%02d", min, sec)
                textView.text = "$appName: ${percent}% • $timeStr"
                mainHandler.postDelayed(this, 1000)
            }
        }
        mainHandler.postDelayed(stage1TimerRunnable!!, 1000)
    }

    // =========================================================================
    // STAGE 2: Micro-Boundary with 6-Second Breathing Pause
    // =========================================================================
    private fun showStage2MicroBoundary(
        packageName: String,
        mindlessnessScore: Double,
        triggerReason: String
    ) {
        val appName = getAppShortName(packageName)
        val root = FrameLayout(context).apply {
            setBackgroundColor(Color.parseColor("#F2090D16")) // Deep dark translucent
            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true
        }

        // Handle hardware back key to dismiss and go home
        root.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                logIntervention(packageName, 2, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
                true
            } else {
                false
            }
        }

        // Top bar with explicit close button
        val topBar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(dp(16), dp(36), dp(16), 0)
        }
        val topCloseBtn = TextView(context).apply {
            text = "✕ Exit"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(8).toFloat()
                setColor(Color.parseColor("#1E293B"))
            }
            setOnClickListener {
                logIntervention(packageName, 2, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
            }
        }
        topBar.addView(topCloseBtn)
        root.addView(topBar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        ))

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(20), dp(28), dp(32))
        }
        root.addView(container, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))

        // Badge
        val badge = TextView(context).apply {
            text = "STAGE 2 • MICRO-BOUNDARY"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38BDF8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(6))
        }
        container.addView(badge)

        // Title
        val title = TextView(context).apply {
            text = "MindShift Pause"
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        container.addView(title)

        // Reason subtitle
        val reason = TextView(context).apply {
            text = triggerReason
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            setPadding(0, dp(6), 0, dp(24))
        }
        container.addView(reason)

        // Breathing Circle
        val breathingCircle = TextView(context).apply {
            text = "Breathe in..."
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#1E3A8A"))
                setStroke(dp(3), Color.parseColor("#60A5FA"))
            }
            layoutParams = LinearLayout.LayoutParams(dp(140), dp(140)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(20)
            }
        }
        container.addView(breathingCircle)

        // 6-Second Breathing Circle Scale Animation (Inhale 3s, Exhale 3s)
        breathingAnimator = ValueAnimator.ofFloat(0.88f, 1.15f).apply {
            duration = 3000
            repeatCount = 1
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { animator ->
                val scale = animator.animatedValue as Float
                breathingCircle.scaleX = scale
                breathingCircle.scaleY = scale
            }
            start()
        }

        // Countdown prompt text
        val countdownText = TextView(context).apply {
            text = "Take a deep breath (6s pause)"
            textSize = 14f
            setTextColor(Color.parseColor("#38BDF8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(24))
        }
        container.addView(countdownText)

        // Buttons Layout
        val buttonRow = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
        }
        container.addView(buttonRow)

        // Button 1: "Close App (Mindful Choice)" - ALWAYS VISIBLE AND CLICKABLE!
        val closeBtn = Button(context).apply {
            text = "✓ Close App (Mindful Choice)"
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            textSize = 15f
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor("#10B981")) // Green
            }
            setPadding(dp(16), dp(14), dp(16), dp(14))
            setOnClickListener {
                logIntervention(packageName, 2, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
            }
        }
        buttonRow.addView(closeBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(12) })

        // Button 2: "Continue for 5m" - Starts disabled with countdown, enables after 6s
        val continueBtn = Button(context).apply {
            text = "Continue in 6s..."
            setTextColor(Color.parseColor("#64748B"))
            isEnabled = false
            textSize = 14f
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#334155"))
            }
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setOnClickListener {
                logIntervention(packageName, 2, mindlessnessScore, "OVERRIDDEN")
                dismissCurrentOverlay()
            }
        }
        buttonRow.addView(continueBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        windowManager.addView(root, layoutParams)
        currentOverlayView = root
        root.requestFocus()

        // 6-Second Handler-Based Countdown
        var secondsRemaining = 6
        breathingCountdownRunnable = object : Runnable {
            override fun run() {
                if (secondsRemaining > 0) {
                    continueBtn.text = "Continue in ${secondsRemaining}s..."
                    countdownText.text = "Take a deep breath (${secondsRemaining}s remaining)"
                    if (secondsRemaining > 3) {
                        breathingCircle.text = "Breathe in..."
                    } else {
                        breathingCircle.text = "Breathe out..."
                    }
                    secondsRemaining--
                    mainHandler.postDelayed(this, 1000)
                } else {
                    // Countdown completed!
                    breathingCircle.text = "Mindful Pause"
                    countdownText.text = "What is your intentional choice?"
                    continueBtn.isEnabled = true
                    continueBtn.text = "Continue to $appName"
                    continueBtn.setTextColor(Color.WHITE)
                    (continueBtn.background as GradientDrawable).apply {
                        setColor(Color.parseColor("#334155"))
                        setStroke(dp(1), Color.parseColor("#38BDF8"))
                    }
                }
            }
        }
        mainHandler.post(breathingCountdownRunnable!!)
    }

    // =========================================================================
    // STAGE 3: Progressive Friction Task (Typing a Mindfulness Sentence)
    // =========================================================================
    private fun showStage3FrictionTask(
        packageName: String,
        mindlessnessScore: Double,
        triggerReason: String
    ) {
        val appName = getAppShortName(packageName)
        val targetPhrase = MINDFUL_PHRASES.random()

        val root = FrameLayout(context).apply {
            setBackgroundColor(Color.parseColor("#FA090D16"))
            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true
        }

        // Handle hardware back key
        root.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                logIntervention(packageName, 3, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
                true
            } else {
                false
            }
        }

        // Top bar with exit button
        val topBar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(dp(16), dp(36), dp(16), 0)
        }
        val topCloseBtn = TextView(context).apply {
            text = "✕ Exit"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(8).toFloat()
                setColor(Color.parseColor("#1E293B"))
            }
            setOnClickListener {
                logIntervention(packageName, 3, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
            }
        }
        topBar.addView(topCloseBtn)
        root.addView(topBar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        ))

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(20), dp(28), dp(32))
        }
        root.addView(container, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))

        // Badge
        val badge = TextView(context).apply {
            text = "STAGE 3 • FRICTION RESTRAINT"
            textSize = 11f
            setTextColor(Color.parseColor("#F59E0B"))
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(8))
        }
        container.addView(badge)

        val title = TextView(context).apply {
            text = "Reflective Friction"
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        container.addView(title)

        val desc = TextView(context).apply {
            text = "To open $appName, accurately type the mindful phrase below:"
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(18))
        }
        container.addView(desc)

        // Phrase Card
        val phraseCard = TextView(context).apply {
            text = "\"$targetPhrase\""
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38BDF8"))
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(8).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#38BDF8"))
            }
        }
        container.addView(phraseCard, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(16) })

        // Input Field
        val editText = EditText(context).apply {
            hint = "Type the phrase here..."
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            textSize = 14f
            setPadding(dp(14), dp(14), dp(14), dp(14))
            isFocusable = true
            isFocusableInTouchMode = true
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(8).toFloat()
                setColor(Color.parseColor("#0F172A"))
                setStroke(dp(1), Color.parseColor("#475569"))
            }
        }
        container.addView(editText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(20) })

        // Unlock Button (Disabled until typed phrase matches)
        val unlockBtn = Button(context).apply {
            text = "Type phrase above to unlock"
            setTextColor(Color.parseColor("#64748B"))
            isEnabled = false
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#334155"))
            }
            setPadding(dp(16), dp(14), dp(16), dp(14))
            setOnClickListener {
                logIntervention(packageName, 3, mindlessnessScore, "OVERRIDDEN")
                dismissCurrentOverlay()
            }
        }
        container.addView(unlockBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(12) })

        // Exit to Home Button
        val exitBtn = Button(context).apply {
            text = "Exit to Home Screen"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#DC2626")) // Red
            }
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setOnClickListener {
                logIntervention(packageName, 3, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
            }
        }
        container.addView(exitBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Watch user typing
        editText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val input = s?.toString()?.trim() ?: ""
                val matches = input.equals(targetPhrase.trim(), ignoreCase = true)
                unlockBtn.isEnabled = matches
                if (matches) {
                    unlockBtn.text = "✓ Continue to $appName"
                    unlockBtn.setTextColor(Color.WHITE)
                    (unlockBtn.background as GradientDrawable).apply {
                        setColor(Color.parseColor("#2563EB"))
                        setStroke(0, Color.TRANSPARENT)
                    }
                } else {
                    unlockBtn.text = "Type phrase above to unlock"
                    unlockBtn.setTextColor(Color.parseColor("#64748B"))
                    (unlockBtn.background as GradientDrawable).apply {
                        setColor(Color.parseColor("#1E293B"))
                        setStroke(dp(1), Color.parseColor("#334155"))
                    }
                }
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                    WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
        }

        windowManager.addView(root, layoutParams)
        currentOverlayView = root

        // Request focus and open soft keyboard
        editText.postDelayed({
            editText.requestFocus()
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(editText, InputMethodManager.SHOW_IMPLICIT)
        }, 250)
    }

    // =========================================================================
    // STAGE 4: Strict Lockout Screen (Exponential Decay Limit Reached)
    // =========================================================================
    private fun showStage4HardLock(
        packageName: String,
        mindlessnessScore: Double,
        limitMs: Long,
        usedMs: Long
    ) {
        val appName = getAppShortName(packageName)
        val limitMin = (limitMs / 60000).coerceAtLeast(1)
        val usedMin = (usedMs / 60000).coerceAtLeast(1)

        val root = FrameLayout(context).apply {
            setBackgroundColor(Color.parseColor("#FD0B0F19")) // Solid dark lockout
            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true
        }

        // Handle hardware back key to go home
        root.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                logIntervention(packageName, 4, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
                true
            } else {
                false
            }
        }

        // Top bar with exit button
        val topBar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(dp(16), dp(36), dp(16), 0)
        }
        val topCloseBtn = TextView(context).apply {
            text = "✕ Exit"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(8).toFloat()
                setColor(Color.parseColor("#1E293B"))
            }
            setOnClickListener {
                logIntervention(packageName, 4, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
            }
        }
        topBar.addView(topCloseBtn)
        root.addView(topBar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        ))

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(32), dp(20), dp(32), dp(40))
        }
        root.addView(container, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))

        // Lock Icon
        val lockIcon = TextView(context).apply {
            text = "🔒"
            textSize = 48f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(12))
        }
        container.addView(lockIcon)

        val title = TextView(context).apply {
            text = "Daily Allowance Reached"
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#EF4444")) // Red-500
            gravity = Gravity.CENTER
        }
        container.addView(title)

        val desc = TextView(context).apply {
            text = "You have utilized $usedMin mins of your target $limitMin mins daily exponential allowance for $appName."
            textSize = 14f
            setTextColor(Color.parseColor("#CBD5E1"))
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(22))
        }
        container.addView(desc)

        // Trajectory Info Card
        val infoCard = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#EF4444"))
            }
        }
        val infoTitle = TextView(context).apply {
            text = "Exponential Step-Down Target"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#94A3B8"))
        }
        val infoBody = TextView(context).apply {
            text = "MindShift gradually scales down daily screen time limits to preserve digital self-control. This app will unlock tomorrow at 00:00."
            textSize = 13f
            setTextColor(Color.WHITE)
            setPadding(0, dp(4), 0, 0)
        }
        infoCard.addView(infoTitle)
        infoCard.addView(infoBody)
        container.addView(infoCard, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(24) })

        // Exit to Home Button
        val homeBtn = Button(context).apply {
            text = "Return to Home Screen"
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            textSize = 15f
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor("#DC2626"))
            }
            setPadding(dp(16), dp(14), dp(16), dp(14))
            setOnClickListener {
                logIntervention(packageName, 4, mindlessnessScore, "COMPLIED_CLOSED_APP")
                dismissCurrentOverlay()
                navigateToHomeScreen()
            }
        }
        container.addView(homeBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        windowManager.addView(root, layoutParams)
        currentOverlayView = root
        root.requestFocus()
    }

    private fun navigateToHomeScreen() {
        try {
            val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
            }
            context.startActivity(homeIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch home screen: ${e.message}", e)
        }
    }

    private fun logIntervention(
        packageName: String,
        stage: Int,
        score: Double,
        action: String
    ) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(context)
                db.interventionLogDao().insert(
                    InterventionLogEntity(
                        packageName = packageName,
                        timestamp = System.currentTimeMillis(),
                        interventionStage = stage,
                        mindlessnessScore = score,
                        userAction = action,
                        synced = false
                    )
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error writing intervention log: ${e.message}", e)
            }
        }
    }

    private fun getAppShortName(packageName: String): String {
        return when (packageName) {
            "com.instagram.android" -> "Instagram"
            "com.google.android.youtube" -> "YouTube"
            "com.twitter.android" -> "X/Twitter"
            "com.zhiliaoapp.musically" -> "TikTok"
            "com.facebook.katana" -> "Facebook"
            "com.snapchat.android" -> "Snapchat"
            "com.reddit.frontpage" -> "Reddit"
            "com.linkedin.android" -> "LinkedIn"
            "org.telegram.messenger" -> "Telegram"
            "com.whatsapp" -> "WhatsApp"
            else -> packageName.split('.').lastOrNull() ?: packageName
        }
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            context.resources.displayMetrics
        ).toInt()
    }
}
