 package app.zkpassport.zkpassport.mrzscan

import android.Manifest
import android.animation.ValueAnimator
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.LinearInterpolator
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RelativeLayout
import android.widget.TextView
import androidx.constraintlayout.widget.ConstraintLayout
import android.widget.Toast
import androidx.camera.core.*
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.lifecycle.ProcessCameraProvider
import android.content.ComponentCallbacks2
import androidx.camera.view.PreviewView
import androidx.cardview.widget.CardView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.LifecycleOwner
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.common.util.concurrent.ListenableFuture
import org.jmrtd.lds.icao.MRZInfo
import app.zkpassport.zkpassport.R
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import android.util.TypedValue

/**
 * Camera Fragment using CameraX API for MRZ scanning
 */
class CameraMLKitFragment : Fragment(), ComponentCallbacks2 {

    private fun debug(message: String) {
        if (MRZScanConfig.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }

    companion object {
        private const val TAG = "CameraMLKitFragment"
        private const val REQUEST_CAMERA_PERMISSION = 1
        private const val RATIO_4_3_VALUE = 4.0 / 3.0
        private const val RATIO_16_9_VALUE = 16.0 / 9.0
        private const val ARG_DOCUMENT_TYPE = "document_type"

        fun newInstance(documentType: String? = null): CameraMLKitFragment {
            val fragment = CameraMLKitFragment()
            val args = Bundle()
            documentType?.let { args.putString(ARG_DOCUMENT_TYPE, it) }
            fragment.arguments = args
            return fragment
        }
    }

    interface CameraMLKitCallback {
        fun onPassportRead(mrz: String, confidence: Float)
        fun onMRZSeen()
        fun onError(message: String?)
        fun onProcessingUpdate(status: String)
        fun onScanProgress(currentFrames: Int, requiredFrames: Int)
    }

    // Camera components
    private lateinit var cameraProviderFuture: ListenableFuture<ProcessCameraProvider>
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private lateinit var cameraExecutor: ExecutorService

    // MRZ processing components
    private var cameraMLKitCallback: CameraMLKitCallback? = null
    private var enhancedProcessor: EnhancedMRZProcessor? = null
    private var mrzRegionDetector: MRZRegionDetector? = null
    private val mHandler = Handler(Looper.getMainLooper())

    // State tracking
    private var isProcessing = false
    private var processingFrameCount = 0
    private var lastConfidence = 0f
    private var lastProcessingTime: Long = 0L
    private var averageProcessingTime: Long = 200L  // Initial estimate
    private var mrzDetected = false
    private var mrzSeen = false // Indicates if the MRZ has been seen at least once
    private var consecutiveNoMrzFrames = 0 // Track consecutive frames without MRZ
    private var maxProgressReached = 0f // Track the maximum progress reached (checkpoint)

    // Confirmation state
    private var pendingMrz: String? = null
    private var pendingConfidence: Float = 0f
    private var pendingMrzLines: List<String>? = null  // Best valid group MRZ lines
    private var isAwaitingConfirmation = false
    private var isConsensusResult = false  // Track if result came from consensus

    // Instruction label state
    private var instructionState = InstructionState.INITIAL
    private var holdStillTimer: Runnable? = null
    private val holdStillTimeoutMs = 15000L // 15 seconds

    enum class InstructionState {
        INITIAL,        // "Place your MRZ in the frame"
        HOLD_STILL,     // "Hold still"
        STUCK,          // "Ensure good lighting and avoid glare"
        PROGRESS,       // "Verifying X%" - shows progress counter
        NEARLY_THERE,   // "Nearly there" - when one frame away from completion
        FINISHED        // "MRZ retrieved" - when the MRZ is retrieved
    }

    // View references
    private var previewView: PreviewView? = null
    private var cancelButton: ImageButton? = null
    private var torchButton: ImageButton? = null
    private var mrzGuide: View? = null
    private var mrzDefaultBorder: View? = null
    private var mrzSuccessBorder: View? = null
    private var mrzCornerBrackets: CornerBracketView? = null
    private var mrzTextOverlay: MrzTextOverlayView? = null
    private var instructionTextContainer: LinearLayout? = null
    private var instructionPrimary: TextView? = null
    private var instructionSecondary: TextView? = null
    private var instructionSupporting: TextView? = null
    private var wireframeImage: ImageView? = null
    private var scanLineView: ImageView? = null
    private var progressContainer: LinearLayout? = null
    private var progressTrack: View? = null
    private var progressFill: View? = null
    private var statusIndicator: LinearLayout? = null
    private var statusIcon: ImageView? = null
    private var statusText: TextView? = null
    private var torchWarningLabel: TextView? = null
    private var confirmationQuestion: TextView? = null
    private var confirmationSubtitle: TextView? = null
    private var confirmationButtons: LinearLayout? = null
    private var tryAgainButton: Button? = null
    private var confirmButton: Button? = null

    // Torch state
    private var isTorchOn = false

    // Torch state
    private var isTorchEnabled = false
    private var scanLineAnimator: ValueAnimator? = null
    private var currentScanStatus: ScanStatus = ScanStatus.INITIAL
    private var contentConfig: OverlayContentConfig = OverlayContentConfig()
    private var pendingProgress: Float? = null

    // Screen width-relative configuration
    // All dimensions are expressed as fractions of screen width (0.0 to 1.0)
    private data class OverlayContentConfig(
        val primaryText: String = "",
        val secondaryText: String = "",
        val supportingText: String = "",
        val wireframeRes: Int = R.drawable.mrz_passport_wireframe,
        val scanLineBottomMarginFraction: Float = 0f,
        val scanLineWidthFraction: Float = 0.7f,      // ~280dp on 400dp wide screen
        val scanLineHeightFraction: Float = 0.5f,     // ~200dp on 400dp wide screen
        val mrzGuideWidthFraction: Float = 0.875f,    // ~350dp on 400dp wide screen
        val mrzGuideHeightFraction: Float = 0.175f,   // ~70dp on 400dp wide screen
        val mrzGuideBottomMarginFraction: Float = 0.025f,
        val wireframeWidthFraction: Float = 1.0f,     // Wireframe width as fraction of screen width
        val wireframeHeightFraction: Float = 1.25f,   // Wireframe height as fraction of screen width
        val wireframeBottomMarginFraction: Float = 0.25f,
        val wireframeVerticalBias: Float = 0.35f      // 0.0 = top, 0.5 = center, 1.0 = bottom
    )

    // Debug view components
    private var debugImageView: ImageView? = null
    private var debugImageCard: CardView? = null
    private var debugToggleFab: FloatingActionButton? = null
    private var isDebugViewVisible = true

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val layoutRes = if (MRZScanConfig.showDebugImageView) {
            R.layout.fragment_camera_mrz_debug
        } else {
            R.layout.fragment_camera_mrz
        }
        return inflater.inflate(layoutRes, container, false)
     }

     override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
         super.onViewCreated(view, savedInstanceState)

        // Register for memory pressure callbacks
        try {
            requireContext().registerComponentCallbacks(this)
        } catch (e: Exception) {
            Log.w(TAG, "Error registering component callbacks: ${e.message}")
        }

        // Initialize camera executor
        cameraExecutor = Executors.newSingleThreadExecutor()

        // Find views
        previewView = view.findViewById(R.id.camera_preview_x)
        cancelButton = view.findViewById(R.id.cancel_button)
        torchButton = view.findViewById(R.id.torch_button)
        instructionTextContainer = view.findViewById(R.id.instruction_text_container)
        instructionPrimary = view.findViewById(R.id.instruction_primary)
        instructionSecondary = view.findViewById(R.id.instruction_secondary)
        instructionSupporting = view.findViewById(R.id.instruction_supporting)
        wireframeImage = view.findViewById(R.id.wireframe_image)
        scanLineView = view.findViewById(R.id.mrz_scan_line)
        mrzGuide = view.findViewById(R.id.mrz_guide)
        mrzDefaultBorder = view.findViewById(R.id.mrz_default_border)
        mrzSuccessBorder = view.findViewById(R.id.mrz_success_border)
        mrzCornerBrackets = view.findViewById(R.id.mrz_corner_brackets)
        mrzTextOverlay = view.findViewById(R.id.mrz_text_overlay)
        progressContainer = view.findViewById(R.id.progress_container)
        progressTrack = view.findViewById(R.id.progress_track)
        progressFill = view.findViewById(R.id.progress_fill)
        statusIndicator = view.findViewById(R.id.status_indicator)
        statusIcon = view.findViewById(R.id.status_icon)
        statusText = view.findViewById(R.id.status_text)
        torchWarningLabel = view.findViewById(R.id.torch_warning_label)
        confirmationQuestion = view.findViewById(R.id.confirmation_question)
        confirmationSubtitle = view.findViewById(R.id.confirmation_subtitle)
        confirmationButtons = view.findViewById(R.id.confirmation_buttons)
        tryAgainButton = view.findViewById(R.id.try_again_button)
        confirmButton = view.findViewById(R.id.confirm_button)

        configureOverlayForDocument(arguments?.getString(ARG_DOCUMENT_TYPE))


        // Setup UI
        cancelButton?.setOnClickListener {
             activity?.setResult(android.app.Activity.RESULT_CANCELED)
             activity?.finish()
         }

        torchButton?.setOnClickListener {
            toggleTorch()
        }

        //updateTorchStatusLabel()

        // Setup confirmation buttons
        tryAgainButton?.setOnClickListener {
            hideConfirmationDialog()
            restartScanning()
        }

        confirmButton?.setOnClickListener {
            hideConfirmationDialog()
            // Proceed with the pending MRZ data
            pendingMrz?.let { mrz ->
                cameraMLKitCallback?.onPassportRead(mrz, pendingConfidence)
            }
        }

        // Setup debug view if enabled
        if (MRZScanConfig.showDebugImageView) {
            setupDebugView(view)
        }

        // Initialize MRZ text overlay
        initializeMRZOverlay()

        // Initialize MRZ processor
        initializeEnhancedProcessor()

        // Check camera permission
        if (hasCameraPermission()) {
            startCamera()
        } else {
            requestCameraPermission()
        }
     }

    private fun configureOverlayForDocument(documentType: String?) {
        val context = requireContext()
        val screenWidth = getScreenWidth()

        // Log the document type for debugging
        debug("Configuring overlay for document type: $documentType, screen width: $screenWidth px")

        // All dimensions are now relative to screen width for consistent scaling across devices
        contentConfig = when (documentType?.uppercase()) {
            "TD1", "ID-CARD", "ID_CARD" -> OverlayContentConfig(
                primaryText = context.getString(R.string.mrz_headline_id_primary),
                secondaryText = context.getString(R.string.mrz_headline_id_secondary),
                supportingText = context.getString(R.string.mrz_instruction_initial),
                wireframeRes = R.drawable.mrz_id_wireframe,
                scanLineBottomMarginFraction = 0f,
                scanLineWidthFraction = 0.85f,        // 85% of screen width for ID cards
                scanLineHeightFraction = 0.6f,        // 60% of screen width for height
                mrzGuideWidthFraction = 0.85f,        // 85% of screen width
                mrzGuideHeightFraction = 0.18f,       // 18% of screen width for height
                mrzGuideBottomMarginFraction = 0.2f,  // Bottom margin as fraction
                wireframeWidthFraction = 0.9f,        // 90% of screen width
                wireframeHeightFraction = 1.0f,       // 100% of screen width for height
                wireframeBottomMarginFraction = 0f,
                wireframeVerticalBias = 0.55f
            )
            "RESIDENCE-PERMIT", "RESIDENCE_PERMIT" -> OverlayContentConfig(
                primaryText = context.getString(R.string.mrz_headline_residence_primary),
                secondaryText = context.getString(R.string.mrz_headline_residence_secondary),
                supportingText = context.getString(R.string.mrz_instruction_initial),
                wireframeRes = R.drawable.mrz_id_wireframe,
                scanLineBottomMarginFraction = 0f,
                scanLineWidthFraction = 0.75f,        // 75% of screen width
                scanLineHeightFraction = 0.6f,        // 60% of screen width for height
                mrzGuideWidthFraction = 0.85f,        // 85% of screen width
                mrzGuideHeightFraction = 0.18f,       // 18% of screen width for height
                mrzGuideBottomMarginFraction = 0.2f,
                wireframeWidthFraction = 0.9f,
                wireframeHeightFraction = 1.0f,
                wireframeBottomMarginFraction = 0f,
                wireframeVerticalBias = 0.55f
            )
            "TD3", "PASSPORT" -> OverlayContentConfig(
                primaryText = context.getString(R.string.mrz_headline_passport_primary),
                secondaryText = context.getString(R.string.mrz_headline_passport_secondary),
                supportingText = context.getString(R.string.mrz_instruction_initial),
                wireframeRes = R.drawable.mrz_passport_wireframe,
                scanLineBottomMarginFraction = 0f,
                scanLineWidthFraction = 0.68f,        // 68% of screen width
                scanLineHeightFraction = 0.6f,        // 60% of screen width for height
                mrzGuideWidthFraction = 0.85f,        // 85% of screen width
                mrzGuideHeightFraction = 0.11f,       // 11% of screen width for height (shorter for passport)
                mrzGuideBottomMarginFraction = 0f,
                wireframeWidthFraction = 1.1f,        // 110% of screen width
                wireframeHeightFraction = 1.2f,       // 120% of screen width for height
                wireframeBottomMarginFraction = 0.24f,
                wireframeVerticalBias = 0.35f
            )
            else -> {
                // Default to passport if no document type specified
                debug("Unknown or null document type, defaulting to passport")
                OverlayContentConfig(
                    primaryText = context.getString(R.string.mrz_headline_passport_primary),
                    secondaryText = context.getString(R.string.mrz_headline_passport_secondary),
                    supportingText = context.getString(R.string.mrz_instruction_initial),
                    wireframeRes = R.drawable.mrz_passport_wireframe,
                    scanLineBottomMarginFraction = 0f,
                    scanLineWidthFraction = 0.68f,
                    scanLineHeightFraction = 0.65f,
                    mrzGuideWidthFraction = 0.95f,    // 95% of screen width for default
                    mrzGuideHeightFraction = 0.11f,
                    mrzGuideBottomMarginFraction = 0.025f,
                    wireframeWidthFraction = 1.1f,
                    wireframeHeightFraction = 1.2f,
                    wireframeBottomMarginFraction = 0.24f,
                    wireframeVerticalBias = 0.35f
                )
            }
        }

        instructionPrimary?.text = contentConfig.primaryText
        instructionSecondary?.text = contentConfig.secondaryText
        instructionSupporting?.text = contentConfig.supportingText
        wireframeImage?.setImageResource(contentConfig.wireframeRes)
        wireframeImage?.visibility = View.VISIBLE
        scanLineView?.setImageResource(R.drawable.mrz_scan_line)

        // Adjust wireframe size and position using screen width fractions
        wireframeImage?.layoutParams?.let { layoutParams ->
            val frameParams = layoutParams as FrameLayout.LayoutParams
            frameParams.width = fractionToPixels(contentConfig.wireframeWidthFraction)
            frameParams.height = fractionToPixels(contentConfig.wireframeHeightFraction)
            frameParams.bottomMargin = fractionToPixels(contentConfig.wireframeBottomMarginFraction)
            wireframeImage?.layoutParams = frameParams
            debug("Wireframe dimensions: ${frameParams.width}x${frameParams.height} px, bottomMargin: ${frameParams.bottomMargin} px")
        }

        // Adjust instruction text container position using screen width fractions
        instructionTextContainer?.layoutParams?.let { layoutParams ->
            val constraintParams = layoutParams as ConstraintLayout.LayoutParams
            // Text bottom margin as fraction of screen width
            val textBottomMarginFraction = when (documentType?.uppercase()) {
                "TD1", "ID-CARD", "ID_CARD", "RESIDENCE-PERMIT", "RESIDENCE_PERMIT" -> 0.36f
                else -> 0.36f
            }
            constraintParams.bottomMargin = fractionToPixels(textBottomMarginFraction)
            instructionTextContainer?.layoutParams = constraintParams
        }

        // Update scan line dimensions using screen width fractions
        scanLineView?.layoutParams?.let { layoutParams ->
            val frameParams = layoutParams as FrameLayout.LayoutParams
            frameParams.width = fractionToPixels(contentConfig.scanLineWidthFraction)
            frameParams.height = fractionToPixels(contentConfig.scanLineHeightFraction)
            frameParams.bottomMargin = fractionToPixels(contentConfig.scanLineBottomMarginFraction)
            // Add top margin for passports using screen width fraction
            val scanLineTopMarginFraction = when (documentType?.uppercase()) {
                "TD3", "PASSPORT" -> 0.06f  // 6% of screen width
                "TD1", "ID-CARD", "ID_CARD", "RESIDENCE-PERMIT", "RESIDENCE_PERMIT" -> 0f
                else -> 0.06f
            }
            frameParams.topMargin = fractionToPixels(scanLineTopMarginFraction)
            scanLineView?.layoutParams = frameParams
            debug("Scan line dimensions: ${frameParams.width}x${frameParams.height} px")
        }

        // Update MRZ guide dimensions using screen width fractions - this is the anchor view
        mrzGuide?.layoutParams?.let { layoutParams ->
            val constraintParams = layoutParams as ConstraintLayout.LayoutParams
            constraintParams.width = fractionToPixels(contentConfig.mrzGuideWidthFraction)
            constraintParams.height = fractionToPixels(contentConfig.mrzGuideHeightFraction)
            // Bottom margin as fraction of screen height for vertical positioning
            val screenHeight = resources.displayMetrics.heightPixels
            val bottomMarginFraction = when (documentType?.uppercase()) {
                "TD1", "ID-CARD", "ID_CARD", "RESIDENCE-PERMIT", "RESIDENCE_PERMIT" -> 0.39f
                else -> 0.35f
            }
            constraintParams.bottomMargin = (screenHeight * bottomMarginFraction).toInt()
            mrzGuide?.layoutParams = constraintParams
            debug("MRZ guide dimensions: ${constraintParams.width}x${constraintParams.height} px, bottomMargin: ${constraintParams.bottomMargin} px")
        }

        // Request layout update so constrained views (mrzDefaultBorder, mrzSuccessBorder, 
        // mrzTextOverlay, mrzCornerBrackets) automatically resize to match mrz_guide
        mrzGuide?.requestLayout()

        // Update corner bracket line lengths based on screen width
        // These control how long each bracket line is drawn
        mrzCornerBrackets?.let { brackets ->
            val (horizontalFraction, verticalFraction) = when (documentType?.uppercase()) {
                // ID cards: proportional bracket lengths
                "TD1", "ID-CARD", "ID_CARD", "RESIDENCE-PERMIT", "RESIDENCE_PERMIT" -> Pair(0.24f, 0.06f)
                // Passports: shorter vertical for the shorter guide
                else -> Pair(0.24f, 0.045f)
            }
            brackets.setBracketDimensions(
                fractionToPixels(horizontalFraction).toFloat(),
                fractionToPixels(verticalFraction).toFloat(),
                0f
            )
        }

        updateScanStatus(ScanStatus.INITIAL)
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics).toInt()
    }

    /**
     * Get the screen width in pixels
     */
    private fun getScreenWidth(): Int {
        return resources.displayMetrics.widthPixels
    }

    /**
     * Convert a fraction of screen width to pixels
     * @param fraction Value between 0.0 and 1.0+ representing percentage of screen width
     */
    private fun fractionToPixels(fraction: Float): Int {
        return (getScreenWidth() * fraction).toInt()
    }

    private fun startScanLineAnimation() {
        val scanView = scanLineView ?: return
        val borderView = mrzDefaultBorder ?: wireframeImage ?: return

        // If animation is already running, just ensure visibility and return
        if (scanLineAnimator?.isRunning == true) {
            scanView.visibility = View.VISIBLE
            return
        }

        // TESTING: Always show scan line for testing purposes
        scanView.visibility = View.VISIBLE
        scanView.translationX = 0f
        scanView.rotation = 0f

        scanView.post {
            val containerWidth = borderView.width.takeIf { it > 0 } ?: borderView.measuredWidth
            val documentType = arguments?.getString(ARG_DOCUMENT_TYPE)

            // Calculate travel range based on document type using screen width fractions
            val travel = if (documentType?.uppercase() == "TD1" ||
                           documentType?.uppercase() == "ID-CARD" ||
                           documentType?.uppercase() == "ID_CARD" || 
                           documentType?.uppercase() == "RESIDENCE-PERMIT" ||
                           documentType?.uppercase() == "RESIDENCE_PERMIT") {
                // For ID cards: Use the scan line width directly for wider travel
                fractionToPixels(contentConfig.scanLineWidthFraction / 2).toFloat()
            } else {
                // For passports: Use MRZ guide width minus padding
                val scanBoxWidth = fractionToPixels(contentConfig.mrzGuideWidthFraction)
                val padding = fractionToPixels(contentConfig.mrzGuideBottomMarginFraction)
                (scanBoxWidth / 2) - padding.toFloat()
            }

            // Add offset for passport scan line using screen width fraction
            val offsetFraction = if (documentType?.uppercase() == "TD3" || documentType?.uppercase() == "PASSPORT") {
                0.036f // ~15dp offset on 400dp screen
            } else {
                0f // No offset for ID cards
            }
            val offset = fractionToPixels(offsetFraction).toFloat()

            // Only cancel and restart if not already running
            if (scanLineAnimator?.isRunning != true) {
                scanLineAnimator?.cancel()

                scanLineAnimator = ValueAnimator.ofFloat(-travel + offset, travel + offset).apply {
                    duration = 2000
                    repeatCount = ValueAnimator.INFINITE
                    repeatMode = ValueAnimator.REVERSE
                    interpolator = LinearInterpolator()
                    addUpdateListener { animator ->
                        val value = animator.animatedValue as Float
                        scanView.translationX = value
                    }
                    start()
                }
            }
        }
    }

    private fun stopScanLineAnimation() {
        scanLineAnimator?.cancel()
        scanLineAnimator = null
        scanLineView?.visibility = View.GONE
        scanLineView?.translationX = 0f
    }

    private fun setHeadline(primary: String, secondary: String) {
        instructionPrimary?.text = primary
        instructionSecondary?.text = secondary
    }

    private fun resetHeadlineToDocumentDefaults() {
        setHeadline(contentConfig.primaryText, contentConfig.secondaryText)
    }

    private fun applyProgress(progress: Float?) {
        val fillView = progressFill ?: return
        val trackView = progressTrack ?: return

        if (progress == null) {
            // Reset to max progress reached (checkpoint) instead of 0
            val resetWidth = (trackView.width * maxProgressReached).toInt()
            fillView.layoutParams = fillView.layoutParams.apply {
                width = resetWidth
            }
            fillView.requestLayout()
            pendingProgress = null
            return
        }

        val clamped = progress.coerceIn(0f, 1f)

        // Update checkpoint - progress can only go forward, never backward
        if (clamped > maxProgressReached) {
            maxProgressReached = clamped
        }

        // Always use the maximum progress reached
        val effectiveProgress = maxProgressReached

        if (trackView.width == 0) {
            pendingProgress = effectiveProgress
            trackView.post { applyProgress(pendingProgress) }
            return
        }

        val newWidth = (trackView.width * effectiveProgress).toInt()

        // Animate progress bar width change smoothly
        val currentWidth = fillView.width
        if (currentWidth != newWidth && newWidth > currentWidth) {
            ValueAnimator.ofInt(currentWidth, newWidth).apply {
                duration = 200 // Smooth 200ms animation
                interpolator = android.view.animation.DecelerateInterpolator()
                addUpdateListener { animator ->
                    val animatedWidth = animator.animatedValue as Int
                    fillView.layoutParams = fillView.layoutParams.apply {
                        width = animatedWidth
                    }
                    fillView.requestLayout()
                }
                start()
            }
        } else if (newWidth > currentWidth) {
            // Direct update for small changes
            fillView.layoutParams = fillView.layoutParams.apply {
                width = newWidth
            }
            fillView.requestLayout()
        }

        pendingProgress = null
    }

    private fun updateScanStatus(newStatus: ScanStatus, progress: Float? = null) {
        if (!isAdded) return

        // Always update progress if provided
        progress?.let { applyProgress(it) }

        if (currentScanStatus == newStatus && progress == null) {
            return
        }

        currentScanStatus = newStatus

        mHandler.post {
            try {
                when (newStatus) {
                    ScanStatus.INITIAL -> {
                        resetHeadlineToDocumentDefaults()
                        instructionSupporting?.text = getString(R.string.mrz_instruction_initial)
                        applyProgress(null)
                        progressContainer?.visibility = View.INVISIBLE
                        statusIndicator?.visibility = View.INVISIBLE
                        stopScanLineAnimation()
                    }

                    ScanStatus.DETECTING -> {
                        resetHeadlineToDocumentDefaults()
                        instructionSupporting?.text = getString(R.string.mrz_status_scanning)
                        progressContainer?.visibility = View.VISIBLE
                        applyProgress(progress ?: 0f)
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_success)
                        statusText?.text = getString(R.string.mrz_status_hold_still)
                        startScanLineAnimation() // Show scan line during detection
                    }

                    ScanStatus.HOLD_STILL -> {
                        resetHeadlineToDocumentDefaults()
                        instructionSupporting?.text = getString(R.string.mrz_status_scanning)
                        progressContainer?.visibility = View.VISIBLE
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_success)
                        statusText?.text = getString(R.string.mrz_status_hold_still)
                        applyProgress(progress ?: 0f)
                        startScanLineAnimation()
                    }

                    ScanStatus.CROPPED -> {
                        setHeadline(
                            getString(R.string.mrz_status_cropped_title),
                            getString(R.string.mrz_status_cropped_subtitle)
                        )
                        instructionSupporting?.text = getString(R.string.mrz_status_detecting)
                        applyProgress(null)
                        progressContainer?.visibility = View.INVISIBLE
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_warning)
                        statusText?.text = getString(R.string.mrz_status_cropped_indicator)
                        stopScanLineAnimation()
                    }

                    ScanStatus.ERROR -> {
                        resetHeadlineToDocumentDefaults()
                        instructionSupporting?.text = getString(R.string.mrz_status_error)
                        applyProgress(null)
                        progressContainer?.visibility = View.INVISIBLE
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_error)
                        statusText?.text = getString(R.string.mrz_status_error_indicator)
                        stopScanLineAnimation()
                    }

                    ScanStatus.TIMEOUT -> {
                        resetHeadlineToDocumentDefaults()
                        instructionSupporting?.text = getString(R.string.mrz_status_timeout)
                        applyProgress(null)
                        progressContainer?.visibility = View.INVISIBLE
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_warning)
                        statusText?.text = getString(R.string.mrz_status_timeout_indicator)
                        stopScanLineAnimation()
                    }

                    ScanStatus.SUCCESS -> {
                        resetHeadlineToDocumentDefaults()
                        instructionSupporting?.text = getString(R.string.mrz_status_success)
                        applyProgress(null)
                        progressContainer?.visibility = View.INVISIBLE
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_success)
                        statusText?.text = getString(R.string.mrz_status_success_indicator)
                        stopScanLineAnimation()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error updating scan status UI", e)
            }
        }
    }

     override fun onAttach(context: Context) {
         super.onAttach(context)
         val activity = activity
         if (activity is CameraMLKitCallback) {
             cameraMLKitCallback = activity
         }
     }

    override fun onPause() {
        debug("onPause - Pausing camera operations")

        // Stop camera processing to free resources
        try {
            cameraProvider?.unbindAll()
            debug("Camera unbound in onPause")
        } catch (e: Exception) {
            Log.e(TAG, "Error unbinding camera in onPause", e)
        }

        super.onPause()
    }

    override fun onResume() {
        super.onResume()

        debug("onResume - Resuming camera operations")

        // Restart camera if we have permission
        if (hasCameraPermission() && previewView != null) {
            startCamera()
        }
    }

     override fun onDetach() {
         cameraMLKitCallback = null
         super.onDetach()
    }

    override fun onDestroyView() {
        debug("onDestroyView - Starting cleanup")

        // Clean up timers
        cancelHoldStillTimer()

        // Stop and clear camera resources
        try {
            cameraProvider?.unbindAll()
            debug("Camera provider unbound")
        } catch (e: Exception) {
            Log.e(TAG, "Error unbinding camera provider", e)
        }

        // Clear camera references
        camera = null
        preview = null
        imageAnalyzer = null
        cameraProvider = null

        // Shutdown camera executor
        try {
            cameraExecutor.shutdown()
            debug("Camera executor shutdown")
        } catch (e: Exception) {
            Log.e(TAG, "Error shutting down camera executor", e)
        }

        // Clean up processor
        enhancedProcessor?.let { processor ->
            debug("Releasing enhanced processor in onDestroyView")
            processor.release()
            enhancedProcessor = null
        }
        
        // Clean up MRZ region detector
        mrzRegionDetector?.let { detector ->
            debug("Releasing MRZ region detector in onDestroyView")
            detector.close()
            mrzRegionDetector = null
        }
        stopScanLineAnimation()

        // Clear UI references
        previewView = null
        cancelButton = null
        torchButton = null
        mrzGuide = null
        mrzDefaultBorder = null
        mrzSuccessBorder = null
        mrzTextOverlay = null
        torchWarningLabel = null
        instructionPrimary = null
        instructionSecondary = null
        instructionSupporting = null
        wireframeImage = null
        scanLineView = null
        progressContainer = null
        progressTrack = null
        progressFill = null
        statusIndicator = null
        statusIcon = null
        statusText = null
        confirmationQuestion = null
        confirmationSubtitle = null
        confirmationButtons = null
        confirmButton = null
        tryAgainButton = null
        pendingProgress = null
        currentScanStatus = ScanStatus.INITIAL

        // Unregister memory callbacks
        try {
            requireContext().unregisterComponentCallbacks(this)
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering component callbacks: ${e.message}")
        }

        debug("onDestroyView - Cleanup completed")
        super.onDestroyView()
    }

    // Memory pressure handling
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        // No action needed for configuration changes
    }

    override fun onLowMemory() {
        Log.w(TAG, "Low memory detected - forcing cleanup")
        handleMemoryPressure(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }

    override fun onTrimMemory(level: Int) {
        Log.w(TAG, "Memory trim requested - level: $level")
        handleMemoryPressure(level)
    }

    private fun handleMemoryPressure(level: Int) {
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> {
                // Severe memory pressure - force immediate cleanup
                Log.w(TAG, "Severe memory pressure - forcing immediate cleanup")
                TesseractEngineManager.forceCleanup()
                System.gc() // Request garbage collection
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE -> {
                // Moderate memory pressure - release non-essential resources
                Log.w(TAG, "Moderate memory pressure - releasing resources")
                if (enhancedProcessor != null) {
                    enhancedProcessor?.release()
                    enhancedProcessor = null
                    // Re-initialize on next processing cycle
                }
                if (mrzRegionDetector != null) {
                    mrzRegionDetector?.close()
                    mrzRegionDetector = null
                    // Re-initialize on next processing cycle
                }
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> {
                // Running low on memory - reduce frame processing
                Log.w(TAG, "Memory running low - reducing processing frequency")
                // Temporarily increase frame skip count
                MRZScanConfig.frameSkipCount = maxOf(MRZScanConfig.frameSkipCount, 3)
                MRZScanConfig.minProcessingIntervalMs = maxOf(MRZScanConfig.minProcessingIntervalMs, 1000L)
            }
        }
    }

    private fun setupDebugView(view: View) {
        debugImageView = view.findViewById(R.id.debug_image_view)
        debugImageCard = view.findViewById(R.id.debug_image_card)
        debugToggleFab = view.findViewById(R.id.debug_toggle_fab)

        // Setup toggle button
        debugToggleFab?.setOnClickListener {
            toggleDebugViewVisibility()
        }

        // Initially visible
        debugImageCard?.visibility = View.VISIBLE
    }

    private fun toggleDebugViewVisibility() {
        isDebugViewVisible = !isDebugViewVisible
        debugImageCard?.visibility = if (isDebugViewVisible) View.VISIBLE else View.GONE
    }

    private fun showDebugImage(bitmap: Bitmap) {
        if (!isAdded || debugImageView == null) return

        mHandler.post {
            try {
                // Ensure debug card is visible
                if (debugImageCard?.visibility != View.VISIBLE) {
                    debugImageCard?.visibility = View.VISIBLE
                }

                // Scale the image down for display
                val maxDimension = 400 // Max size for debug view
                val scale = minOf(
                    maxDimension.toFloat() / bitmap.width,
                    maxDimension.toFloat() / bitmap.height,
                    0.25f // Max 25% of original size
                )

                val scaledWidth = (bitmap.width * scale).toInt().coerceAtLeast(1)
                val scaledHeight = (bitmap.height * scale).toInt().coerceAtLeast(1)

                val scaledBitmap = Bitmap.createScaledBitmap(
                    bitmap,
                    scaledWidth,
                    scaledHeight,
                    true
                )

                debugImageView?.setImageBitmap(scaledBitmap)

                if (MRZScanConfig.enableDebugLogging) {
                    debug("Debug image updated: ${scaledWidth}x${scaledHeight}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error showing debug image: ${e.message}", e)
            }
        }
    }

    private fun initializeEnhancedProcessor() {
        val documentType = arguments?.getString(ARG_DOCUMENT_TYPE)
        enhancedProcessor = EnhancedMRZProcessor(requireContext(), documentType).apply {
            initialize()
        }
        debug("Enhanced MRZ processor initialized with document type: $documentType")
        
        // Initialize MRZ region detector for dynamic cropping if enabled
        if (MRZScanConfig.enableVisionMRZDetection) {
            mrzRegionDetector = MRZRegionDetector().apply {
                if (initialize()) {
                    debug("MRZ region detector initialized for dynamic cropping")
                } else {
                    Log.w(TAG, "Failed to initialize MRZ region detector, will use fixed ROI")
                }
            }
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            requireContext(),
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestCameraPermission() {
        if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
            Toast.makeText(
                requireContext(),
                "Camera permission is required for MRZ scanning",
                Toast.LENGTH_LONG
            ).show()
        }
        requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA_PERMISSION)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera()
            } else {
                Toast.makeText(
                    requireContext(),
                    "Camera permission denied",
                    Toast.LENGTH_SHORT
                ).show()
                activity?.finish()
            }
        }
    }

    private fun startCamera() {
        val preview = previewView ?: run {
            Log.e(TAG, "PreviewView not found")
            return
        }

        cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            bindCameraUseCases(preview)
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun getHighestAvailableResolution(cameraInfo: CameraInfo?): android.util.Size {
        if (cameraInfo == null) {
            Log.w(TAG, "CameraInfo not available, using default resolution")
            return android.util.Size(1920, 1080)
        }

        try {
            // Get Camera2 info to access stream configuration map
            val camera2Info = Camera2CameraInfo.from(cameraInfo)
            val cameraCharacteristics = camera2Info.getCameraCharacteristic(
                android.hardware.camera2.CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP
            )

            // Get available output sizes for ImageFormat.JPEG (best quality)
            val outputSizes = cameraCharacteristics?.getOutputSizes(ImageFormat.JPEG)
                ?: return android.util.Size(1920, 1080)

            // Sort by pixel count (width * height) in descending order
            val sortedSizes = outputSizes.sortedByDescending { it.width.toLong() * it.height }

            // Log available sizes
            if (MRZScanConfig.enableDebugLogging) {
                debug("Available camera resolutions:")
                sortedSizes.forEach { size ->
                    debug("  - ${size.width}x${size.height} (${size.width * size.height / 1_000_000}MP)")
                }
            }

            // Get the highest resolution (first in sorted list)
            val highestResolution = sortedSizes.firstOrNull() ?: android.util.Size(1920, 1080)

            // Apply maximum resolution limits if needed (to avoid memory issues)
            val maxWidth = MRZScanConfig.maxCameraResolutionWidth
            val maxHeight = MRZScanConfig.maxCameraResolutionHeight

            // Find the highest resolution within limits
            val bestResolution = sortedSizes.firstOrNull { size ->
                size.width <= maxWidth && size.height <= maxHeight
            } ?: highestResolution

            debug("Selected highest available resolution: ${bestResolution.width}x${bestResolution.height}")
            return bestResolution

        } catch (e: Exception) {
            Log.e(TAG, "Error getting camera resolutions", e)
            return android.util.Size(1920, 1080)
        }
    }

    private fun bindCameraUseCases(previewView: PreviewView) {
        val cameraProvider = cameraProvider ?: return

        // Select back camera
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        // Get camera info to determine highest available resolution
        val cameraInfo = cameraProvider.availableCameraInfos.firstOrNull { info ->
            Camera2CameraInfo.from(info).getCameraCharacteristic(
                android.hardware.camera2.CameraCharacteristics.LENS_FACING
            ) == android.hardware.camera2.CameraCharacteristics.LENS_FACING_BACK
        }

        // Determine target resolution - use highest available if configured
        val targetResolution = if (MRZScanConfig.useHighestAvailableResolution) {
            getHighestAvailableResolution(cameraInfo)
        } else {
            android.util.Size(
                MRZScanConfig.cameraResolutionWidth,
                MRZScanConfig.cameraResolutionHeight
            )
        }

        debug("Setting camera resolution to: ${targetResolution.width}x${targetResolution.height}")

        preview = Preview.Builder()
            .setTargetResolution(targetResolution)
            .build()
            .also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

        // Image analysis use case with same resolution for better OCR
        // Using RGBA_8888 format for simpler, more reliable bitmap conversion across all devices
        imageAnalyzer = ImageAnalysis.Builder()
            .setTargetResolution(targetResolution)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
            .also {
                it.setAnalyzer(cameraExecutor, MRZImageAnalyzer())
            }

        try {
            // Unbind use cases before rebinding
            cameraProvider.unbindAll()

            // Bind use cases to camera
            camera = cameraProvider.bindToLifecycle(
                this as LifecycleOwner,
                cameraSelector,
                preview,
                imageAnalyzer
            )

            // Enable auto-focus
            val cameraControl = camera?.cameraControl
            val cameraInfo = camera?.cameraInfo
            val zoomState = cameraInfo?.zoomState?.value
            val minZoom = zoomState?.minZoomRatio ?: 1.0f
            cameraControl?.setZoomRatio(minZoom)

        } catch (exc: Exception) {
            Log.e(TAG, "Use case binding failed", exc)
            cameraMLKitCallback?.onError("Failed to start camera: ${exc.message}")
        }
    }

    /**
     * Image analyzer for processing camera frames
     */
    private inner class MRZImageAnalyzer : ImageAnalysis.Analyzer {

        override fun analyze(imageProxy: ImageProxy) {
            if (!isProcessing && enhancedProcessor != null) {
                val currentTime = System.currentTimeMillis()

                // Intelligent timing-based frame limiting
                if (MRZScanConfig.minProcessingIntervalMs > 0 &&
                    currentTime - lastProcessingTime < MRZScanConfig.minProcessingIntervalMs) {
                    imageProxy.close()
                    return
                }

                // Apply frame skipping if configured
                if (MRZScanConfig.frameSkipCount > 0 &&
                    processingFrameCount % (MRZScanConfig.frameSkipCount + 1) != 0) {
                    processingFrameCount++
                    imageProxy.close()
                    return
                }

                if (MRZScanConfig.enableDebugLogging && processingFrameCount % 10 == 0) {
                    debug("Analyzing frame $processingFrameCount")
                }

                isProcessing = true
                processingFrameCount++
                lastProcessingTime = currentTime

                try {
                    // Convert ImageProxy to Bitmap
                    val bitmap = imageProxyToBitmap(imageProxy)
                    if (bitmap != null) {
                        if (MRZScanConfig.enableDebugLogging && processingFrameCount == 1) {
                            debug("Processing bitmap resolution: ${bitmap.width}x${bitmap.height}")
                        }
                        processWithEnhancedOCR(bitmap)
                    } else {
                        isProcessing = false
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Frame processing error", e)
                    isProcessing = false
                }
            }

            // Always close the image
            imageProxy.close()
        }
    }

    /**
     * Crop bitmap to the MRZ guide box region
     */
    private fun cropToMRZGuideBox(bitmap: Bitmap): Bitmap {
        return try {
            val previewView = view?.findViewById<androidx.camera.view.PreviewView>(R.id.camera_preview_x)
            val mrzGuide = view?.findViewById<View>(R.id.mrz_guide)

            if (previewView == null || mrzGuide == null) {
                debug("⚠️ Could not get preview or guide view, returning uncropped bitmap")
                return bitmap
            }

            // Get the guide box position on screen
            val guideLocation = IntArray(2)
            mrzGuide.getLocationInWindow(guideLocation)
            val guideLeft = guideLocation[0]
            val guideTop = guideLocation[1]
            val guideWidth = mrzGuide.width
            val guideHeight = mrzGuide.height

            // Get preview view position on screen
            val previewLocation = IntArray(2)
            previewView.getLocationInWindow(previewLocation)
            val previewLeft = previewLocation[0]
            val previewTop = previewLocation[1]
            val previewWidth = previewView.width
            val previewHeight = previewView.height

            if (previewWidth == 0 || previewHeight == 0 || guideWidth == 0 || guideHeight == 0) {
                debug("⚠️ Invalid dimensions, returning uncropped bitmap")
                debug("   Preview: ${previewWidth}x${previewHeight}, Guide: ${guideWidth}x${guideHeight}")
                return bitmap
            }

            // Calculate guide box position as fractions of preview size
            val relativeLeft = guideLeft - previewLeft
            val relativeTop = guideTop - previewTop

            debug("🔍 Relative position: ($relativeLeft, $relativeTop)")

            // Calculate fractions (0.0 to 1.0)
            val leftFraction = relativeLeft.toFloat() / previewWidth.toFloat()
            val topFraction = relativeTop.toFloat() / previewHeight.toFloat()
            val widthFraction = guideWidth.toFloat() / previewWidth.toFloat()
            val heightFraction = guideHeight.toFloat() / previewHeight.toFloat()

            debug("🔍 Fractions: left=$leftFraction, top=$topFraction, width=$widthFraction, height=$heightFraction")

            // Apply fractions to bitmap dimensions (centered crop approach)
            // Account for potential aspect ratio mismatch between preview and bitmap
            val bitmapAspect = bitmap.width.toFloat() / bitmap.height.toFloat()
            val previewAspect = previewWidth.toFloat() / previewHeight.toFloat()

            debug("🔍 Aspect ratios: bitmap=$bitmapAspect, preview=$previewAspect")

            val cropLeft: Int
            val cropTop: Int
            val cropWidth: Int
            val cropHeight: Int

            if (bitmapAspect > previewAspect) {
                // Bitmap is wider - preview is cropped on left/right
                // Map to the center portion of the bitmap
                val usedBitmapWidth = (bitmap.height * previewAspect).toInt()
                val bitmapOffsetX = (bitmap.width - usedBitmapWidth) / 2

                cropLeft = (bitmapOffsetX + leftFraction * usedBitmapWidth).toInt().coerceIn(0, bitmap.width - 1)
                cropTop = (topFraction * bitmap.height).toInt().coerceIn(0, bitmap.height - 1)
                cropWidth = (widthFraction * usedBitmapWidth).toInt().coerceAtLeast(1)
                cropHeight = (heightFraction * bitmap.height).toInt().coerceAtLeast(1)

                debug("🔍 Bitmap wider: usedWidth=$usedBitmapWidth, offsetX=$bitmapOffsetX")
            } else {
                // Bitmap is taller - preview is cropped on top/bottom
                // Map to the center portion of the bitmap
                val usedBitmapHeight = (bitmap.width / previewAspect).toInt()
                val bitmapOffsetY = (bitmap.height - usedBitmapHeight) / 2

                cropLeft = (leftFraction * bitmap.width).toInt().coerceIn(0, bitmap.width - 1)
                cropTop = (bitmapOffsetY + topFraction * usedBitmapHeight).toInt().coerceIn(0, bitmap.height - 1)
                cropWidth = (widthFraction * bitmap.width).toInt().coerceAtLeast(1)
                cropHeight = (heightFraction * usedBitmapHeight).toInt().coerceAtLeast(1)

                debug("🔍 Bitmap taller: usedHeight=$usedBitmapHeight, offsetY=$bitmapOffsetY")
            }

            // Ensure crop rectangle is within bitmap bounds
            val adjustedWidth = cropWidth.coerceAtMost(bitmap.width - cropLeft)
            val adjustedHeight = cropHeight.coerceAtMost(bitmap.height - cropTop)

            if (adjustedWidth <= 0 || adjustedHeight <= 0) {
                debug("⚠️ Invalid crop dimensions, returning uncropped bitmap")
                return bitmap
            }

            // Create cropped bitmap
            val croppedBitmap = Bitmap.createBitmap(
                bitmap,
                cropLeft,
                cropTop,
                adjustedWidth,
                adjustedHeight
            )

            debug("✅ Cropped to MRZ guide box: ${croppedBitmap.width}x${croppedBitmap.height}")
            croppedBitmap

        } catch (e: Exception) {
            Log.e(TAG, "Error cropping to MRZ guide box: ${e.message}", e)
            bitmap // Return original on error
        }
    }

    /**
     * Crop bitmap to MRZ region using dynamic detection (like iOS Vision) with fallback to fixed ROI.
     * 
     * This method:
     * 1. If enableVisionMRZDetection is enabled, uses MLKit to detect MRZ text regions
     * 2. Combines detected MRZ line bounding boxes into a single crop region with padding
     * 3. Falls back to the standard fixed ROI (MRZ guide box) if no MRZ is detected
     * 
     * This matches the iOS implementation that uses Apple Vision for dynamic MRZ region detection.
     */
    private fun cropToMRZRegion(bitmap: Bitmap): Bitmap {
        // Check if dynamic MRZ detection is enabled
        if (!MRZScanConfig.enableVisionMRZDetection) {
            debug("🔍 Vision MRZ detection disabled, using fixed ROI")
            return cropToMRZGuideBox(bitmap)
        }

        // Check if detector is initialized
        val detector = mrzRegionDetector
        if (detector == null) {
            debug("🔍 MRZ region detector not initialized, using fixed ROI")
            return cropToMRZGuideBox(bitmap)
        }

        return try {
            // Detect MRZ region using MLKit (synchronous for frame processing)
            val mrzBounds = detector.detectMRZRegionSync(bitmap)

            if (mrzBounds != null) {
                // MRZ region detected - use dynamic cropping
                debug("🎯 Vision detected MRZ region: $mrzBounds")
                val croppedBitmap = detector.cropToMRZBounds(bitmap, mrzBounds)
                debug("✅ Dynamically cropped to MRZ region: ${croppedBitmap.width}x${croppedBitmap.height}")
                croppedBitmap
            } else {
                // No MRZ detected - fall back to fixed ROI
                debug("⚠️ No MRZ region detected by Vision, falling back to fixed ROI")
                cropToMRZGuideBox(bitmap)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in dynamic MRZ cropping: ${e.message}", e)
            // Fall back to fixed ROI on error
            cropToMRZGuideBox(bitmap)
        }
    }

    /**
     * Convert CameraX ImageProxy to Bitmap
     *
     * Using RGBA_8888 format for simple, reliable conversion across all devices.
     * This avoids the complex device-specific YUV_420_888 buffer layouts that
     * vary between manufacturers (Pixel vs OnePlus vs Samsung, etc.)
     */
    private var hasLoggedImageFormat = false  // Log image format details only once

    private fun imageProxyToBitmap(imageProxy: ImageProxy): Bitmap? {
        return try {
            val width = imageProxy.width
            val height = imageProxy.height
            val plane = imageProxy.planes[0]
            val buffer = plane.buffer
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride

            // Log format details on first frame for debugging
            if (!hasLoggedImageFormat) {
                hasLoggedImageFormat = true
                Log.i(TAG, "=== Image Format Details (first frame) ===")
                Log.i(TAG, "Device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
                Log.i(TAG, "Image dimensions: ${width}x${height}")
                Log.i(TAG, "Format: RGBA_8888")
                Log.i(TAG, "Plane - rowStride: $rowStride, pixelStride: $pixelStride, buffer size: ${buffer.remaining()}")
                Log.i(TAG, "==========================================")
            }

            // Create bitmap directly from RGBA buffer
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            
            // Reset buffer to read from beginning and get total available bytes
            buffer.rewind()
            val totalAvailableBytes = buffer.remaining()
            
            // Handle potential row stride padding
            if (rowStride == width * pixelStride) {
                // No padding - copy entire buffer at once
                bitmap.copyPixelsFromBuffer(buffer)
            } else {
                // Has padding - need to remove padding before copying
                // Create a new buffer without row padding
                val rowBytes = width * pixelStride
                val cleanBuffer = ByteBuffer.allocateDirect(width * height * pixelStride)

                for (row in 0 until height) {
                    val sourceStart = row * rowStride
                    
                    // Check if this row's start position is within buffer bounds
                    // Some devices don't include padding after the last row
                    if (sourceStart >= totalAvailableBytes) {
                        Log.w(TAG, "Buffer too small: row $row start $sourceStart exceeds available bytes $totalAvailableBytes")
                        break
                    }
                    
                    // Calculate how many bytes we can safely read from this row
                    val availableBytes = totalAvailableBytes - sourceStart
                    val bytesToRead = minOf(rowBytes, availableBytes)
                    
                    // Must set limit before position to avoid IllegalArgumentException
                    // when new position would exceed current limit
                    buffer.limit(sourceStart + bytesToRead)
                    buffer.position(sourceStart)
                    cleanBuffer.put(buffer)
                    
                    // If we couldn't read the full row, pad with zeros
                    if (bytesToRead < rowBytes) {
                        val padding = ByteArray(rowBytes - bytesToRead)
                        cleanBuffer.put(padding)
                    }
                }

                cleanBuffer.rewind()
                buffer.clear() // Reset buffer state
                bitmap.copyPixelsFromBuffer(cleanBuffer)
            }

            // Apply rotation if configured
            var processedBitmap = if (MRZScanConfig.imageRotation != 0f) {
                val matrix = android.graphics.Matrix()
                matrix.postRotate(MRZScanConfig.imageRotation)

                val rotatedBitmap = Bitmap.createBitmap(
                    bitmap,
                    0,
                    0,
                    bitmap.width,
                    bitmap.height,
                    matrix,
                    true
                )

                // Clean up original bitmap if it's different from rotated
                if (bitmap != rotatedBitmap) {
                    bitmap.recycle()
                }

                rotatedBitmap
            } else {
                bitmap
            }

            // Crop to MRZ region - use dynamic detection if enabled, with fallback to fixed ROI
            if (processedBitmap != null) {
                val croppedBitmap = cropToMRZRegion(processedBitmap)
                if (croppedBitmap != processedBitmap) {
                    processedBitmap.recycle()
                }
                croppedBitmap
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error converting ImageProxy to bitmap", e)
            null
        }
    }

    private fun processWithEnhancedOCR(bitmap: Bitmap) {
        // Skip processing if we're awaiting user confirmation
        if (isAwaitingConfirmation) {
            return
        }

        enhancedProcessor?.processBitmap(
            bitmap,
            object : EnhancedMRZProcessor.MRZProcessingCallback {
                override fun onMRZExtracted(mrz: String, confidence: Float) {
                    handleMRZSuccess(mrz, confidence)
                }

                override fun onMRZNotFound() {
                    handleMRZNotFound()
                }

                override fun onProcessingFrame() {
                    handleProcessingFrame()
                }

                override fun onError(exception: Exception) {
                    handleProcessingError(exception)
                }

                override fun onMRZSeen() {
                    mrzSeen = true // Mark MRZ as seen
                    consecutiveNoMrzFrames = 0 // Reset counter when MRZ is seen
                    cameraMLKitCallback?.onMRZSeen()
                    updateScanStatus(ScanStatus.DETECTING)

                     mHandler.postDelayed({
                        // Update instruction to "Hold still" when MRZ is first seen
                        if (instructionState == InstructionState.INITIAL) {
                            updateInstructionLabel(InstructionState.HOLD_STILL)
                            startHoldStillTimer()
                        }
                    }, 1000)
                }

                override fun onMRZLinesDetected(lines: List<String>) {
                    updateMRZOverlay(lines)
                }

                override fun onValidChecksumFrame() {
                    if (instructionState != InstructionState.PROGRESS) {
                        cancelHoldStillTimer()
                    }
                }

                override fun onProgressUpdate(currentFrames: Int, requiredFrames: Int) {
                    // Reset counter on progress update (MRZ is being tracked)
                    consecutiveNoMrzFrames = 0

                    // Notify callback of scan progress (for timeout reset)
                    cameraMLKitCallback?.onScanProgress(currentFrames, requiredFrames)

                    // Calculate progress in 25% increments (for 4 required frames: 0%, 25%, 50%, 75%, 100%)
                    val progress = currentFrames.toFloat() / requiredFrames.toFloat()

                    // Show progress during scanning
                    if (currentFrames == requiredFrames - 1 && currentFrames > 0) {
                        // Nearly there - one frame away from completion
                        updateInstructionLabel(InstructionState.NEARLY_THERE)
                        updateScanStatus(ScanStatus.HOLD_STILL, progress)
                    } else if (currentFrames > 0 && currentFrames < requiredFrames) {
                        // Show progress - this will trigger HOLD_STILL state with scan line
                        updateScanStatus(ScanStatus.HOLD_STILL, progress)
                    } else if (currentFrames == 0) {
                        // First frame - show initial detecting state with 0 progress
                        updateScanStatus(ScanStatus.DETECTING, 0f)
                    }
                }

                override fun onBestValidGroupMRZ(mrzLines: List<String>, mrz: String, confidence: Float) {
                    // Store the best valid group MRZ lines for potential confirmation display
                    pendingMrzLines = mrzLines
                    isConsensusResult = true  // Mark this as a consensus result
                    debug("Best valid group MRZ lines stored: ${mrzLines.joinToString(" | ")}")
                    debug("Consensus achieved - will skip confirmation dialog")
                }
            },
            // Callback for processed image (for debug visualization)
            onProcessedImage = { processedBitmap ->
                if (MRZScanConfig.showDebugImageView) {
                    showDebugImage(processedBitmap)
                }
            }
        )
    }

    private fun handleMRZSuccess(mrz: String, confidence: Float) {
        isProcessing = false
        mrzDetected = true
        lastConfidence = confidence
        cancelHoldStillTimer()

        if (!isAdded) return

        mHandler.post {
            try {
                val confidencePercent = (confidence * 100).toInt()
                
                // Fill progress bar to 100% and keep it visible
                maxProgressReached = 1.0f
                applyProgress(1.0f)
                progressContainer?.visibility = View.VISIBLE
                
                // Show success border and hide default border
                mrzDefaultBorder?.visibility = View.INVISIBLE
                mrzSuccessBorder?.visibility = View.VISIBLE
                
                // Stop scan line animation
                stopScanLineAnimation()

                // Add stronger haptic feedback for success
                if (MRZScanConfig.hapticFeedbackEnabled) {
                    provideSuccessHapticFeedback()
                }

                // Log MRZ info if debug enabled
                logMRZInfo(mrz, confidence)

                // First delay: Let user see progress bar filled to 100%
                mHandler.postDelayed({
                    if (isAdded && !isDetached) {
                        // Update headline to success message with "Details" emphasized
                        setHeadline(
                            getString(R.string.mrz_success_headline_primary), // "Details"
                            getString(R.string.mrz_success_headline_secondary) // "retrieved successfully"
                        )
                        instructionSupporting?.text = "" // Clear supporting text
                        
                        // Show success status indicator
                        statusIndicator?.visibility = View.VISIBLE
                        statusIcon?.setImageResource(R.drawable.ic_status_success)
                        statusText?.text = getString(R.string.mrz_status_success_indicator)
                        
                        // Update instruction state
                        instructionState = InstructionState.FINISHED
                        
                        debug("MRZ detected with confidence ($confidencePercent%) - showing success message")
                        
                        // Second delay: Let user read the success message, then trigger callback
                        mHandler.postDelayed({
                            if (isAdded && !isDetached) {
                                debug("Proceeding to React Native for confirmation")
                                cameraMLKitCallback?.onPassportRead(mrz, confidence)
                            }
                        }, 1500) // Wait 1.5 seconds to show success message
                    }
                }, 500) // Wait 0.5 seconds to see progress bar filled
            } catch (e: Exception) {
                Log.e(TAG, "Error handling MRZ success", e)
            }
        }
    }

    private fun handleMRZNotFound() {
        isProcessing = false

        if (!isAdded || instructionState == InstructionState.FINISHED) return

        // Increment consecutive no-MRZ counter
        consecutiveNoMrzFrames++

        // Clear MRZ overlay when no MRZ is found
        clearMRZOverlay()

        // Show default border and hide success border
        mrzDefaultBorder?.visibility = View.VISIBLE
        mrzSuccessBorder?.visibility = View.INVISIBLE

        // Reset to INITIAL if:
        // 1. MRZ has never been seen, OR
        // 2. MRZ was seen but 3+ consecutive frames without MRZ detected
        if (!mrzSeen || consecutiveNoMrzFrames >= 3) {
            updateScanStatus(ScanStatus.INITIAL)
            // Reset mrzSeen to allow animation to restart when MRZ is detected again
            if (consecutiveNoMrzFrames >= 3 && mrzSeen) {
                debug("3 consecutive frames without MRZ - resetting scan state")
                mrzSeen = false
                maxProgressReached = 0f // Reset progress checkpoint
            }
        }
    }

    private fun handleProcessingFrame() {
        // Reset processing flag to allow next frame
        isProcessing = false

        if (isAdded) {
            if (MRZScanConfig.showProcessingStatus) {
                cameraMLKitCallback?.onProcessingUpdate("Processing frame $processingFrameCount")
            }
        }
    }

    private fun handleProcessingError(exception: Exception) {
        isProcessing = false

        if (!isAdded) return

        Log.e(TAG, "MRZ processing error", exception)
        updateScanStatus(ScanStatus.ERROR)

        // Don't immediately call onError - just show error state and keep scanning
        // This allows recovery from temporary errors
        debug("Processing error: ${exception.message}")
    }

    private fun provideHapticFeedback() {
        try {
            val vibrator = requireContext().getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator.vibrate(
                    VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(100)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error providing haptic feedback", e)
        }
    }

    private fun provideSuccessHapticFeedback() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                // Android 12+ - Use VibratorManager with stronger feedback
                val vibratorManager = requireContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                val vibrator = vibratorManager?.defaultVibrator

                if (vibrator?.hasVibrator() == true) {
                    // Create a pattern: short-long-short for success
                    val pattern = longArrayOf(0, 100, 50, 200, 50, 100)
                    val amplitudes = intArrayOf(0, VibrationEffect.DEFAULT_AMPLITUDE, 0, 255, 0, VibrationEffect.DEFAULT_AMPLITUDE)
                    val effect = VibrationEffect.createWaveform(pattern, amplitudes, -1)
                    vibrator.vibrate(effect)
                    debug("Success haptic feedback triggered (VibratorManager)")
                }
            } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                // Android 8+ - Use VibrationEffect with pattern
                val vibrator = requireContext().getSystemService(Context.VIBRATOR_SERVICE) as Vibrator

                if (vibrator.hasVibrator()) {
                    // Create a pattern: short-long-short for success
                    val pattern = longArrayOf(0, 100, 50, 200, 50, 100)
                    val amplitudes = intArrayOf(0, VibrationEffect.DEFAULT_AMPLITUDE, 0, 255, 0, VibrationEffect.DEFAULT_AMPLITUDE)
                    val effect = VibrationEffect.createWaveform(pattern, amplitudes, -1)
                    vibrator.vibrate(effect)
                    debug("Success haptic feedback triggered (VibrationEffect)")
                }
            } else {
                // Legacy Android - Use deprecated vibrate method with pattern
                @Suppress("DEPRECATION")
                val vibrator = requireContext().getSystemService(Context.VIBRATOR_SERVICE) as Vibrator

                if (vibrator.hasVibrator()) {
                    @Suppress("DEPRECATION")
                    val pattern = longArrayOf(0, 100, 50, 200, 50, 100) // Pattern: wait, vibrate, pause, vibrate, pause, vibrate
                    vibrator.vibrate(pattern, -1)
                    debug("Success haptic feedback triggered (legacy)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error providing success haptic feedback", e)
        }
    }

    private fun logMRZInfo(mrz: String, confidence: Float) {
        if (MRZScanConfig.enableDebugLogging) {
            debug("""
                MRZ Successfully Read:
                - MRZ: $mrz
                - Confidence: ${(confidence * 100).toInt()}%
                - Frames Processed: $processingFrameCount
            """.trimIndent())
        }
    }

    /**
     * Show the confidence confirmation dialog
     */
    private fun showConfirmationDialog() {
        isAwaitingConfirmation = true

        // Display the best valid group MRZ lines instead of the current overlay
        pendingMrzLines?.let { bestValidMrzLines ->
            updateMRZOverlay(bestValidMrzLines)
            debug("Updated MRZ overlay with best valid group lines: ${bestValidMrzLines.joinToString(" | ")}")
        }

        // Enable confirmation mode for better MRZ readability
        mrzTextOverlay?.setConfirmationMode(true)

        confirmationQuestion?.visibility = View.VISIBLE
        confirmationSubtitle?.visibility = View.VISIBLE
        confirmationButtons?.visibility = View.VISIBLE
        debug("Showing confirmation dialog for low confidence MRZ - image processing paused")
    }

    /**
     * Hide the confidence confirmation dialog
     */
    private fun hideConfirmationDialog() {
        isAwaitingConfirmation = false

        // Disable confirmation mode
        mrzTextOverlay?.setConfirmationMode(false)

        confirmationQuestion?.visibility = View.GONE
        confirmationSubtitle?.visibility = View.GONE
        confirmationButtons?.visibility = View.GONE
        debug("Hiding confirmation dialog - image processing resumed")
    }

    /**
     * Restart the scanning process from the beginning
     */
    private fun restartScanning() {
        debug("Restarting MRZ scanning process")

        // Reset state
        isProcessing = false
        mrzDetected = false
        mrzSeen = false
        consecutiveNoMrzFrames = 0
        maxProgressReached = 0f
        lastConfidence = 0f
        pendingMrz = null
        pendingConfidence = 0f
        pendingMrzLines = null
        isAwaitingConfirmation = false
        isConsensusResult = false

        // Disable torch if enabled
        if (isTorchEnabled) {
            isTorchEnabled = false
            camera?.cameraControl?.enableTorch(false)
            updateTorchButtonAppearance()
            torchWarningLabel?.visibility = View.GONE
        }

        // Reset UI first, then reset state to force instruction label update
        mrzDefaultBorder?.visibility = View.VISIBLE
        mrzSuccessBorder?.visibility = View.INVISIBLE
        mrzTextOverlay?.setConfirmationMode(false) // Disable confirmation mode
        clearMRZOverlay()

        // Force reset instruction state and update label
        instructionState = InstructionState.FINISHED // Set to different state first
        updateInstructionLabel(InstructionState.INITIAL) // This will now update properly

        // Reset processors
        enhancedProcessor?.reset()

        // Cancel any pending timers
        cancelHoldStillTimer()

        debug("MRZ scanning restarted")
    }

    /**
     * Initialize the MRZ text overlay with guide rectangle bounds
     */
    private fun initializeMRZOverlay() {
        // Get document type to determine guide rectangle dimensions
        val documentType = arguments?.getString(ARG_DOCUMENT_TYPE)

        // Adjust guide rectangle dimensions based on document type
        setupGuideRectangle(documentType)

        mrzTextOverlay?.let { overlay ->
            // Set up guide rectangle bounds for the overlay
            view?.findViewById<View>(R.id.mrz_guide)?.let { guideView ->
                guideView.post {
                    val rect = android.graphics.Rect()
                    guideView.getGlobalVisibleRect(rect)

                    // Convert to local coordinates relative to the overlay's parent
                    val overlayRect = android.graphics.Rect(0, 0, guideView.width, guideView.height)
                    overlay.setGuideRect(overlayRect)

                    // Set document type for placeholder (TD1 or TD3)
                    overlay.setPlaceholderDocumentType(documentType)

                    // Show placeholder initially
                    overlay.setPlaceholderVisible(true)

                    debug("MRZ overlay initialized with guide rect: $overlayRect, document type: $documentType")
                }
            }
        }
    }

    /**
     * Setup guide rectangle dimensions based on document type using screen width fractions
     */
    private fun setupGuideRectangle(documentType: String?) {
        view?.let { rootView ->
            val guideView = rootView.findViewById<View>(R.id.mrz_guide)
            val defaultBorder = rootView.findViewById<View>(R.id.mrz_default_border)
            val successBorder = rootView.findViewById<View>(R.id.mrz_success_border)
            val textOverlay = rootView.findViewById<View>(R.id.mrz_text_overlay)

            // Determine height as fraction of screen width based on document type
            val heightFraction = when (documentType?.uppercase()) {
                "TD3", "PASSPORT" -> 0.11f       // ~11% of screen width for passports (TD3 has 2 lines)
                "TD1", "ID_CARD", "RESIDENCE_PERMIT" -> 0.18f  // ~18% of screen width for ID cards (TD1 has 3 lines)
                else -> 0.16f                     // Default compromise
            }

            // Use the width from contentConfig (set in configureOverlayForDocument)
            // This ensures the width matches what was configured for the document type
            val widthFraction = contentConfig.mrzGuideWidthFraction

            // Convert fractions to pixels
            val widthPx = fractionToPixels(widthFraction)
            val heightPx = fractionToPixels(heightFraction)

            // Update all guide-related views
            listOf(guideView, defaultBorder, successBorder, textOverlay).forEach { view ->
                view?.let {
                    val layoutParams = it.layoutParams
                    layoutParams.width = widthPx
                    layoutParams.height = heightPx
                    it.layoutParams = layoutParams
                }
            }

            debug("Guide rectangle adjusted for $documentType: ${widthPx}px x ${heightPx}px (${(widthFraction * 100).toInt()}% x ${(heightFraction * 100).toInt()}% of screen width)")
        }
    }

    /**
     * Update the MRZ text overlay with recognized lines
     */
    private fun updateMRZOverlay(lines: List<String>) {
        if (!isAdded) return

        mHandler.post {
            try {
                mrzTextOverlay?.updateMrzLines(lines)
                debug("Updated MRZ overlay with ${lines.size} lines")
            } catch (e: Exception) {
                Log.e(TAG, "Error updating MRZ overlay", e)
            }
        }
    }

    /**
     * Clear the MRZ text overlay
     */
    private fun clearMRZOverlay() {
        if (!isAdded) return

        mHandler.post {
            try {
                mrzTextOverlay?.clearOverlay()
                debug("Cleared MRZ overlay")
            } catch (e: Exception) {
                Log.e(TAG, "Error clearing MRZ overlay", e)
            }
        }
    }

    /**
     * Update the instruction label based on the current state
     */
    private fun updateInstructionLabel(newState: InstructionState, progressText: String? = null) {
        if (!isAdded || (instructionState == newState && progressText == null)) return

        instructionState = newState

        val status = when (newState) {
            InstructionState.INITIAL -> ScanStatus.INITIAL
            InstructionState.HOLD_STILL -> ScanStatus.HOLD_STILL
            InstructionState.STUCK -> ScanStatus.CROPPED
            InstructionState.PROGRESS -> ScanStatus.HOLD_STILL
            InstructionState.NEARLY_THERE -> ScanStatus.DETECTING
            InstructionState.FINISHED -> ScanStatus.SUCCESS
        }

        val progressValue = progressText
            ?.replace("%", "")
            ?.trim()
            ?.toFloatOrNull()
            ?.div(100f)

        updateScanStatus(status, progressValue)
    }

    /**
     * Start the hold still timer
     */
    private fun startHoldStillTimer() {
        cancelHoldStillTimer()

        holdStillTimer = Runnable {
            if (isAdded && instructionState == InstructionState.HOLD_STILL) {
                updateInstructionLabel(InstructionState.STUCK)
            }
        }

        mHandler.postDelayed(holdStillTimer!!, holdStillTimeoutMs)
        debug("Started hold still timer (${holdStillTimeoutMs}ms)")
    }

    /**
     * Cancel the hold still timer
     */
    private fun cancelHoldStillTimer() {
        holdStillTimer?.let { timer ->
            mHandler.removeCallbacks(timer)
            holdStillTimer = null
            debug("Cancelled hold still timer")
        }
    }

    /**
     * Toggle the camera torch/flash
     */
    private fun toggleTorch() {
        if (!isAdded) return

        isTorchEnabled = !isTorchEnabled

        camera?.cameraControl?.enableTorch(isTorchEnabled)

        // Update torch button appearance
        updateTorchButtonAppearance()

        // Show/hide warning label
        torchWarningLabel?.visibility = if (isTorchEnabled) View.VISIBLE else View.GONE

        debug("Torch ${if (isTorchEnabled) "enabled" else "disabled"}")
    }

    /**
     * Update the torch button appearance based on torch state
     */
    private fun updateTorchButtonAppearance() {
        if (!isAdded) return

        mHandler.post {
            try {
                torchButton?.apply {
                    if (isTorchEnabled) {
                        // Torch is ON - show flash off icon (lightning bolt with line through it)
                        setImageResource(R.drawable.ic_flash_off)
                    } else {
                        // Torch is OFF - show flash on icon (lightning bolt)
                        setImageResource(R.drawable.ic_flash_on)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error updating torch button appearance", e)
            }
        }
    }

    fun showTimeoutState(onComplete: (() -> Unit)? = null) {
        updateScanStatus(ScanStatus.TIMEOUT)
        mHandler.postDelayed({
            onComplete?.invoke()
        }, 1500)
    }
}
