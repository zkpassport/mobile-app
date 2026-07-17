/*
 Vision view controller.
 Recognizes text using a Vision VNRecognizeTextRequest request handler in pixel buffers from an AVCaptureOutput.
 Displays bounding boxes around recognized text results in real time.
 */

import AVFoundation
import Foundation
import SwiftUI
import UIKit
import Vision

// MARK: - Localization Extension
extension String {
    func localized(withComment: String) -> String {
        // Try to find the bundle for PassportReader module (which contains our Localizable.strings)
        if let passportReaderBundle = Bundle(identifier: "org.cocoapods.PassportReader") {
            return NSLocalizedString(self, tableName: nil, bundle: passportReaderBundle, value: self, comment: withComment)
        }
        // Fallback to main bundle
        return NSLocalizedString(self, tableName: nil, bundle: Bundle.main, value: self, comment: withComment)
    }
}

// Enum to represent different scanner results
public enum MRZScanResult {
    case success(String)
    case cancelled
    case timeout
}

// Enum to represent scanner status states
public enum ScanStatus {
    case initial        // Searching for MRZ
    case detecting      // MRZ detected, soft pulsing vibration
    case holdStill      // Position found, verifying
    case cropped        // Camera went out of frame
    case error          // Couldn't read document
    case timeout        // Code not detected
    case success        // Scan successful
}

// ID Type enum to match different document types
public enum IDType: String {
    case passport = "passport"
    case idCard = "id-card"
    case residencePermit = "residence-permit"
}

public func getContentConfig(idType: IDType) -> (highlighted: String, normal: String, wireframe: String, wireframeWidth: CGFloat, wireframeHeight: CGFloat, scanBoxBottom: CGFloat, scanBoxWidth: CGFloat, scanBoxHeight: CGFloat, scanBoxLeftPadding: CGFloat, scanLineWidth: CGFloat, scanLineHeight: CGFloat, scanLineBottom: CGFloat, bracketHorizontal: CGFloat, bracketVertical: CGFloat) {
    switch idType {
    case .passport:
        // Passport: Lower position, wider scan box, taller scan line, larger wireframe
        return ("Photo Page".localized(withComment: "MRZ Scanner"), " of the Passport".localized(withComment: "MRZ Scanner"), "PassportWireframe", 380, 480, 10, 0.93, 60, 25, 280, 240, 0, 80, 20)
    case .idCard:
        // ID Card: Wider scan box positioned lower on screen
        return ("Backside".localized(withComment: "MRZ Scanner"), " of National ID".localized(withComment: "MRZ Scanner"), "IDWireframe", 360, 227, 10, 0.97, 76, 10, 270, 200, 100, 80, 20)
    case .residencePermit:
        // Residence Permit: Same as ID Card
        return ("Backside".localized(withComment: "MRZ Scanner"), " of Residence Permit".localized(withComment: "MRZ Scanner"), "IDWireframe", 360, 227, 10, 0.97, 76, 10, 270, 200, 100, 80, 20)

    }
}

// MARK: - Corner Bracket View (UIKit) and SwiftUI wrapper

// A lightweight UIView that draws four L-shaped corner brackets around its bounds with rounded corners.
final class CornerBracketView: UIView {
    private var horizontalLength: CGFloat = 60
    private var verticalLength: CGFloat = 20
    private var horizontalOffset: CGFloat = 0
    private let lineWidth: CGFloat = 3
    private let strokeColor: UIColor = .white
    private let cornerRadius: CGFloat = 8

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
        contentMode = .redraw
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = .clear
        isUserInteractionEnabled = false
        contentMode = .redraw
    }

    // Configure the bracket dimensions. Call setNeedsDisplay to redraw.
    func setBracketDimensions(horizontal: CGFloat, vertical: CGFloat, offset: CGFloat) {
        self.horizontalLength = max(0, horizontal)
        self.verticalLength = max(0, vertical)
        self.horizontalOffset = offset
        setNeedsLayout()
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        super.draw(rect)

        guard rect.width > 0, rect.height > 0 else { return }
        guard let context = UIGraphicsGetCurrentContext() else { return }

        let minX = rect.minX + lineWidth / 2 + horizontalOffset
        let maxX = rect.maxX - lineWidth / 2
        let minY = rect.minY + lineWidth / 2
        let maxY = rect.maxY - lineWidth / 2

        let h = min(horizontalLength, max(0, maxX - minX))
        let v = min(verticalLength, max(0, maxY - minY))

        // Configure paint
        context.setStrokeColor(strokeColor.cgColor)
        context.setLineWidth(lineWidth)
        context.setLineCap(.round)
        context.setLineJoin(.round)

        // Top-left corner with rounded arc
        context.move(to: CGPoint(x: minX, y: minY + v))
        context.addLine(to: CGPoint(x: minX, y: minY + cornerRadius))
        context.addArc(center: CGPoint(x: minX + cornerRadius, y: minY + cornerRadius),
                       radius: cornerRadius,
                       startAngle: .pi,
                       endAngle: 3 * .pi / 2,
                       clockwise: false)
        context.addLine(to: CGPoint(x: minX + h, y: minY))
        context.strokePath()

        // Top-right corner with rounded arc
        context.move(to: CGPoint(x: maxX - h, y: minY))
        context.addLine(to: CGPoint(x: maxX - cornerRadius, y: minY))
        context.addArc(center: CGPoint(x: maxX - cornerRadius, y: minY + cornerRadius),
                       radius: cornerRadius,
                       startAngle: 3 * .pi / 2,
                       endAngle: 0,
                       clockwise: false)
        context.addLine(to: CGPoint(x: maxX, y: minY + v))
        context.strokePath()

        // Bottom-left corner with rounded arc
        context.move(to: CGPoint(x: minX, y: maxY - v))
        context.addLine(to: CGPoint(x: minX, y: maxY - cornerRadius))
        context.addArc(center: CGPoint(x: minX + cornerRadius, y: maxY - cornerRadius),
                       radius: cornerRadius,
                       startAngle: .pi,
                       endAngle: .pi / 2,
                       clockwise: true)
        context.addLine(to: CGPoint(x: minX + h, y: maxY))
        context.strokePath()

        // Bottom-right corner with rounded arc
        context.move(to: CGPoint(x: maxX - h, y: maxY))
        context.addLine(to: CGPoint(x: maxX - cornerRadius, y: maxY))
        context.addArc(center: CGPoint(x: maxX - cornerRadius, y: maxY - cornerRadius),
                       radius: cornerRadius,
                       startAngle: .pi / 2,
                       endAngle: 0,
                       clockwise: true)
        context.addLine(to: CGPoint(x: maxX, y: maxY - v))
        context.strokePath()
    }
}

// SwiftUI wrapper for CornerBracketView
struct CornerBrackets: UIViewRepresentable {
    let horizontalLength: CGFloat
    let verticalLength: CGFloat
    let horizontalOffset: CGFloat

    func makeUIView(context: Context) -> CornerBracketView {
        let view = CornerBracketView()
        view.setBracketDimensions(horizontal: horizontalLength, vertical: verticalLength, offset: horizontalOffset)
        return view
    }

    func updateUIView(_ uiView: CornerBracketView, context: Context) {
        uiView.setBracketDimensions(horizontal: horizontalLength, vertical: verticalLength, offset: horizontalOffset)
    }
}

// SwiftUI wrapper that adds the close button and dynamic passport/ID overlay
public struct MRZScannerView: View {
    let completionHandler: (MRZScanResult) -> Void
    let idType: IDType
    @State private var scanStatus: ScanStatus = .initial
    @State private var progress: CGFloat = 0.0
    @State private var isTorchOn: Bool = false

    // Scan line animation states
    @State private var scanLineOffset: CGFloat = 0
    @State private var scanLineRotation: Double = 0
    @State private var scanLineTimer: Timer?

    // Content configuration based on ID type
    private var contentConfig = getContentConfig(idType: .passport)

    public init(completionHandler: @escaping (MRZScanResult) -> Void, idType: IDType = .passport) {
        self.completionHandler = completionHandler
        self.idType = idType
        self.contentConfig = getContentConfig(idType: idType)
    }

    public var body: some View {
        ZStack {
            MRZScanner(completionHandler: completionHandler, idType: idType, scanStatus: $scanStatus, progress: $progress, isTorchOn: $isTorchOn)
                .edgesIgnoringSafeArea(.all)
            
            // Full-screen translucent overlay with clear cutout for MRZ scan area
            GeometryReader { screenGeometry in
                let screenWidth = screenGeometry.size.width
                let screenHeight = screenGeometry.size.height
                let wireframeWidth = contentConfig.wireframeWidth
                let wireframeHeight = contentConfig.wireframeHeight
                
                // Calculate wireframe position (matching the VStack layout below)
                // Both this GeometryReader and VStack are in the same coordinate space
                // (safe area), even though the overlay extends to full screen
                let fixedSpaceBelow: CGFloat = 40 + 100
                let wireframeTop = (screenHeight - wireframeHeight - fixedSpaceBelow) / 2
                
                // Calculate MRZ box position
                let mrzWidth = wireframeWidth * contentConfig.scanBoxWidth - contentConfig.scanBoxLeftPadding
                let mrzHeight = contentConfig.scanBoxHeight
                let wireframeLeft = (screenWidth - wireframeWidth) / 2
                let mrzRelativeY = wireframeHeight - contentConfig.scanBoxBottom - mrzHeight
                
                // MRZ box position (same coordinate space as VStack)
                let mrzScreenX = wireframeLeft + contentConfig.scanBoxLeftPadding + mrzWidth / 2
                let mrzScreenY = wireframeTop + mrzRelativeY + mrzHeight / 2
                
                Color.black.opacity(0.25)
                    .edgesIgnoringSafeArea(.all)
                    .mask(
                        ZStack {
                            Rectangle()
                                .fill(Color.white)
                            
                            RoundedRectangle(cornerRadius: 8)
                                .frame(width: mrzWidth, height: mrzHeight)
                                .position(x: mrzScreenX, y: mrzScreenY)
                                .blendMode(.destinationOut)
                        }
                        .compositingGroup()
                    )
            }

            // Wireframe overlay
            VStack {
                Spacer()

                // Wireframe image
                if let image = UIImage(named: contentConfig.wireframe) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: contentConfig.wireframeWidth, height: contentConfig.wireframeHeight)
                        .overlay(
                            ZStack {
                                // MRZ scanning box positioned on wireframe
                                GeometryReader { geometry in
                                    let mrzWidth = geometry.size.width * contentConfig.scanBoxWidth - contentConfig.scanBoxLeftPadding
                                    let mrzHeight = contentConfig.scanBoxHeight
                                    let mrzY = geometry.size.height - contentConfig.scanBoxBottom - mrzHeight
                                    
                                    // MRZ box left edge is at scanBoxLeftPadding
                                    let mrzCenterX = contentConfig.scanBoxLeftPadding + mrzWidth / 2
                                    let mrzCenterY = mrzY + mrzHeight / 2
                                    
                                    ZStack {
                                        // White stroke border around the clear MRZ area
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(Color.white.opacity(0.35), lineWidth: 1)
                                            .frame(width: mrzWidth, height: mrzHeight)
                                            .position(x: mrzCenterX, y: mrzCenterY)
                                        
                                        // Corner brackets overlay
                                        CornerBrackets(
                                            horizontalLength: contentConfig.bracketHorizontal,
                                            verticalLength: contentConfig.bracketVertical,
                                            horizontalOffset: 0
                                        )
                                        .frame(width: mrzWidth, height: mrzHeight)
                                        .position(x: mrzCenterX, y: mrzCenterY)
                                    }
                                }

                                // Animated scan line (visible only when MRZ is detected)
                                if scanStatus == .detecting || scanStatus == .holdStill {
                                    GeometryReader { geometry in
                                        VStack {
                                            Spacer()

                                            if let scanLineImage = UIImage(named: "ScanLine") {
                                                Image(uiImage: scanLineImage)
                                                    .resizable()
                                                    .aspectRatio(contentMode: .fit)
                                                    .frame(width: contentConfig.scanLineWidth, height: contentConfig.scanLineHeight)
                                                    .rotationEffect(.degrees(scanLineRotation))
                                                    .offset(x: scanLineOffset)
                                                    .padding(.bottom, contentConfig.scanLineBottom)
                                                    .zIndex(1)
                                            }
                                        }
                                    }
                                    .onAppear {
                                        startScanLineAnimation()
                                    }
                                    .onDisappear {
                                        stopScanLineAnimation()
                                    }
                                }
                            }
                        )
                }

                Spacer().frame(height: 40)

                // Status-dependent UI (fixed height to prevent layout shifts)
                Group {
                    if scanStatus == .initial || scanStatus == .detecting {
                        // Initial scanning instruction
                        HStack(spacing: 0) {
                            Text(contentConfig.highlighted)
                                .font(.system(size: 24, weight: .semibold))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [Color(red: 0.95, green: 0.86, blue: 0.69), Color(red: 0.96, green: 0.83, blue: 0.56)],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                            Text(contentConfig.normal)
                                .font(.system(size: 24, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    } else if scanStatus == .holdStill {
                        // Scanning in progress with progress bar
                        VStack(spacing: 12) {
                            Text("Scanning in progress".localized(withComment: "MRZ Scanner"))
                                .font(.system(size: 24, weight: .semibold))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [Color(red: 0.95, green: 0.86, blue: 0.69), Color(red: 0.96, green: 0.83, blue: 0.56)],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )

                            // Progress bar
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color(red: 0.25, green: 0.25, blue: 0.25))
                                    .frame(width: 240, height: 4)

                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color(red: 0.96, green: 0.83, blue: 0.56))
                                    .frame(width: 240 * progress, height: 4)
                            }

                            Spacer().frame(height: 12)

                            // Status indicator
                            HStack(spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                    .font(.system(size: 32))
                                Text("Hold still".localized(withComment: "MRZ Scanner"))
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.white)
                            }
                        }
                    } else if scanStatus == .cropped {
                        // Cropped error state
                        VStack(spacing: 12) {
                            HStack(spacing: 0) {
                                Text("Fit the ID ".localized(withComment: "MRZ Scanner"))
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundColor(.white)
                                Text("in the frame".localized(withComment: "MRZ Scanner"))
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundStyle(
                                        LinearGradient(
                                            colors: [Color(red: 0.95, green: 0.86, blue: 0.69), Color(red: 0.96, green: 0.83, blue: 0.56)],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                            }

                            Spacer().frame(height: 12)

                            // Error indicator
                            HStack(spacing: 12) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.red)
                                    .font(.system(size: 32))
                                Text("Cropped".localized(withComment: "MRZ Scanner"))
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.white)
                            }
                        }
                    }
                }
                .frame(height: 0, alignment: .top) // Fixed height to prevent layout shifts

                Spacer().frame(height: 100)
                Spacer()
            }

            // Top buttons overlay (close on left, flash on right)
            VStack {
                HStack {
                    // Close button (top left)
                    Button(action: {
                        completionHandler(.cancelled)
                    }) {
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.2))
                                .frame(width: 44, height: 44)
                                .shadow(color: Color.black.opacity(0.3), radius: 4, x: 0, y: 2)

                            Image(systemName: "xmark")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }
                    .padding(.leading, 16)
                    .padding(.top, 32)

                    Spacer()

                    // Flash button (top right)
                    Button(action: {
                        isTorchOn.toggle()
                    }) {
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.2))
                                .frame(width: 44, height: 44)
                                .shadow(color: Color.black.opacity(0.3), radius: 4, x: 0, y: 2)

                            Image(systemName: isTorchOn ? "bolt.slash.fill" : "bolt.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(isTorchOn ? .white : Color(red: 0.96, green: 0.83, blue: 0.56))
                        }
                    }
                    .padding(.trailing, 16)
                    .padding(.top, 32)
                }
                Spacer()
            }
        }
    }

    // MARK: - Scan Line Animation
    private func startScanLineAnimation() {
        // Calculate dynamic scan range based on scan box width
        let scanBoxWidth = contentConfig.scanBoxWidth * contentConfig.wireframeWidth
        let effectiveScanWidth = scanBoxWidth - contentConfig.scanBoxLeftPadding

        // Adjust boundaries: shift right and expand range
        let horizontalShift: CGFloat = 20  // Shift everything right by 10 points
        let leftBoundary = -(effectiveScanWidth / 2) + (contentConfig.scanBoxLeftPadding / 2) + horizontalShift
        let rightBoundary = (effectiveScanWidth / 2) + (contentConfig.scanBoxLeftPadding / 2) + horizontalShift + 20  // Extend right boundary

        scanLineOffset = leftBoundary // Start at left edge of scan box
        scanLineRotation = 0
        scanLineTimer?.invalidate()

        // Animation parameters
        let animationSpeed: CGFloat = 3.5 // Pixels per frame
        var movingRight = true

        scanLineTimer = Timer.scheduledTimer(withTimeInterval: 0.016, repeats: true) { _ in
            if movingRight {
                scanLineOffset += animationSpeed
                if scanLineOffset >= rightBoundary {
                    // Reached right boundary - instantly rotate 180 degrees and reverse direction
                    movingRight = false
                    scanLineRotation = 180
                }
            } else {
                scanLineOffset -= animationSpeed
                if scanLineOffset <= leftBoundary {
                    // Reached left boundary - instantly rotate back to 0 degrees and reverse direction
                    movingRight = true
                    scanLineRotation = 0
                }
            }
        }
    }

    private func stopScanLineAnimation() {
        scanLineTimer?.invalidate()
        scanLineTimer = nil
    }
}

// SwiftUI wrapper that hosts VisionViewController
struct MRZScanner: UIViewControllerRepresentable {
    let completionHandler: (MRZScanResult) -> Void
    let idType: IDType
    @Binding var scanStatus: ScanStatus
    @Binding var progress: CGFloat
    @Binding var isTorchOn: Bool

    func makeUIViewController(context: Context) -> VisionViewController {
        let vc = VisionViewController()
        vc.completionHandler = { result in
            completionHandler(result)
        }
        vc.statusCallback = { status in
            // keep SwiftUI state in sync on main thread
            DispatchQueue.main.async {
                self.scanStatus = status
            }
        }
        vc.progressCallback = { currentFrames, requiredFrames in
            // Update progress based on frame count
            DispatchQueue.main.async {
                self.progress = CGFloat(currentFrames) / CGFloat(max(requiredFrames, 1))
            }
        }
        vc.idType = idType
        return vc
    }

    func updateUIViewController(_ uiViewController: VisionViewController, context: Context) {
        // Keep properties updated if they change
        uiViewController.completionHandler = { result in
            completionHandler(result)
        }
        uiViewController.statusCallback = { status in
            DispatchQueue.main.async {
                self.scanStatus = status
            }
        }
        uiViewController.progressCallback = { currentFrames, requiredFrames in
            DispatchQueue.main.async {
                self.progress = CGFloat(currentFrames) / CGFloat(max(requiredFrames, 1))
            }
        }
        uiViewController.idType = idType
        
        // Update torch state
        uiViewController.setTorch(on: isTorchOn)
    }
}

public class VisionViewController: ViewController {
    var request: VNRecognizeTextRequest!
    // Temporal string tracker (kept for backward compatibility)
    let mrzTracker = StringTracker()

    // Enhanced MRZ processor
    private let enhancedProcessor = EnhancedMRZProcessor()
    private var useEnhancedProcessing = MRZScanConfig.useEnhancedProcessor

    // Frame throttling (similar to Android's implementation)
    private var lastProcessingTime: TimeInterval = 0
    private var processingFrameCount: Int = 0
    private var isProcessing = false

    // MRZ region detection using Vision
    private var mrzDetectionRequest: VNRecognizeTextRequest?
    private var lastDetectedMRZBounds: CGRect?
    private var mrzDetectionConfidence: Int = 0  // Number of consecutive frames with same MRZ region

    // Debug image view (similar to Android's debugImageView)
    private var debugImageView: UIImageView?
    private var debugContainerView: UIView?
    private var isDebugViewVisible = false

    // Progress indicator for MRZ scanning
    private var progressLabel: UILabel?
    private var progressContainerView: UIView?

    // Hint system for guiding user camera positioning
    private var hintLabel: UILabel?
    private var hintContainerView: UIView?
    private var scanStartTime: TimeInterval = 0
    private var lastHintUpdateTime: TimeInterval = 0
    private let hintDelaySeconds: TimeInterval = 5.0  // Wait before showing hints
    private let hintUpdateIntervalSeconds: TimeInterval = 1.5  // Minimum time between hint changes

    // MRZ text overlay
    private var mrzTextOverlay: MRZTextOverlayView?

    var completionHandler: ((MRZScanResult) -> (Void))?
    var statusCallback: ((ScanStatus) -> Void)?
    var progressCallback: ((Int, Int) -> Void)?
    var idType: IDType = .passport // Default to passport

    // MARK: - Scan State Management
    private var scanStatus: ScanStatus = .initial {
        didSet {
            handleStatusChange(from: oldValue, to: scanStatus)
            statusCallback?(scanStatus)
        }
    }

    // MARK: - Haptic Feedback
    private var hapticTimer: Timer?
    private let feedbackGenerator = UIImpactFeedbackGenerator(style: .light)

    // MARK: - Detection tracking
    private var detectingFrameCount = 0
    private let detectingThreshold = 10 // Frames needed to trigger "detecting" state (increased for stability)
    private var lastDetectionTime: Date?
    private let detectionTimeoutSeconds: TimeInterval = 10.0

    // MARK: - Hold still tracking
    private var holdStillStartTime: Date?
    private let holdStillDuration: TimeInterval = 3.0
    private var holdStillFrameCount = 0
    private let holdStillThreshold = 15 // Consecutive frames needed to maintain holdStill state

    // MARK: - Stability tracking (prevent rapid state changes)
    private var noDetectionFrameCount = 0
    private let noDetectionThreshold = 20 // Frames without detection before transitioning to cropped

    // MARK: - Scan Timeout
    private var scanTimeoutTimer: Timer?
    private let scanTimeoutDuration: TimeInterval = 60.0 // 60 seconds

    public override func viewDidLoad() {
        // Initialize enhanced processor if enabled
        if useEnhancedProcessing {
            enhancedProcessor.initialize()
            setupEnhancedProcessing()
            setupMRZDetection()
        } else {
            // Set up vision request for legacy processing
            request = VNRecognizeTextRequest(completionHandler: recognizeTextHandler)
        }

        super.viewDidLoad()

        // Setup MRZ text overlay
        setupMRZTextOverlay()

        // Start 60-second timeout timer
        startScanTimeout()
    }

    // MARK: - Scan Timeout Methods
    private func startScanTimeout() {
        scanTimeoutTimer = Timer.scheduledTimer(withTimeInterval: scanTimeoutDuration, repeats: false) { [weak self] _ in
            self?.handleScanTimeout()
        }
    }

    private func cancelScanTimeout() {
        scanTimeoutTimer?.invalidate()
        scanTimeoutTimer = nil
    }

    private func handleScanTimeout() {
        // Stop the camera
        captureSessionQueue.sync {
            self.captureSession.stopRunning()
        }

        // Stop haptic feedback
        stopHapticFeedback()

        // Clear MRZ overlay
        mrzTextOverlay?.clearOverlay()

        // Cancel timeout timer
        cancelScanTimeout()

        // Call completion handler with timeout result
        DispatchQueue.main.async {
            self.completionHandler?(.timeout)
        }
    }

    // MARK: - Region of Interest Override
    override func calculateRegionOfInterest() {
        // Position ROI inside the corner brackets (no visual cutout, just for OCR processing)
        let desiredHeightRatio: CGFloat
        let desiredWidthRatio: CGFloat
        let maxPortraitWidth: CGFloat
        let verticalOffset: CGFloat // Offset from center (negative = higher, positive = lower)

        switch idType {
        case .passport:
            // Passport: Lower position, wider region
            desiredHeightRatio = 0.15  // Shorter height (was 0.2)
            desiredWidthRatio = 0.69   // Wider (was 0.8)
            maxPortraitWidth = 0.69
            verticalOffset = -0.20     // Move down significantly (positive = lower on screen)

        case .idCard, .residencePermit:
            // ID/Residence: Narrower region, centered
            desiredHeightRatio = 0.17  // Shorter height
            desiredWidthRatio = 0.70   // Narrower (was 0.8)
            maxPortraitWidth = 0.70
            verticalOffset = 0.0       // Keep centered
        }

        // Figure out size of ROI
        let size: CGSize
        if currentOrientation.isPortrait || currentOrientation == .unknown {
            size = CGSize(
                width: min(desiredWidthRatio * bufferAspectRatio, maxPortraitWidth),
                height: desiredHeightRatio / bufferAspectRatio)
        } else {
            size = CGSize(width: desiredWidthRatio, height: desiredHeightRatio)
        }

        // Position with vertical offset
        let yPosition = ((1 - size.height) / 2) + verticalOffset
        regionOfInterest.origin = CGPoint(x: (1 - size.width) / 2, y: yPosition)
        regionOfInterest.size = size

        // ROI changed, update transform
        setupOrientationAndTransform()

        // Update MRZ overlay guide rect with new ROI
        updateMRZOverlayGuideRect()

        // Note: We don't call updateCutout() because cutoutView is hidden
    }

    public override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopHapticFeedback()
        cancelScanTimeout()
        // Turn off torch when leaving
        setTorch(on: false)
    }

    // MARK: - Torch Control
    
    /// Toggle the device torch/flashlight
    func setTorch(on: Bool) {
        guard let device = captureDevice, device.hasTorch else { return }
        
        do {
            try device.lockForConfiguration()
            device.torchMode = on ? .on : .off
            device.unlockForConfiguration()
        } catch {
            print("Error setting torch: \(error)")
        }
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Update overlay guide rect when layout changes
        updateMRZOverlayGuideRect()
    }

    // MARK: - Haptic Feedback Methods

    private func startDetectingHaptics() {
        // Soft pulsing vibration every 1 second while detecting
        stopHapticFeedback()
        hapticTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.feedbackGenerator.impactOccurred(intensity: 0.5)
        }
    }

    private func triggerHoldStillHaptic() {
        // Short vibration when transitioning to "hold still"
        feedbackGenerator.impactOccurred(intensity: 0.7)
    }

    private func triggerErrorHaptic() {
        // Double short vibration for error
        feedbackGenerator.impactOccurred(intensity: 1.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.feedbackGenerator.impactOccurred(intensity: 1.0)
        }
    }

    private func stopHapticFeedback() {
        hapticTimer?.invalidate()
        hapticTimer = nil
    }

    // MARK: - State Change Handler

    private func handleStatusChange(from oldStatus: ScanStatus, to newStatus: ScanStatus) {
        switch newStatus {
        case .initial:
            stopHapticFeedback()
            detectingFrameCount = 0
            lastDetectionTime = nil
            holdStillStartTime = nil
            holdStillFrameCount = 0
            noDetectionFrameCount = 0

        case .detecting:
            if oldStatus != .detecting {
                startDetectingHaptics()
                lastDetectionTime = Date()
            }
            noDetectionFrameCount = 0

        case .holdStill:
            if oldStatus != .holdStill {
                stopHapticFeedback()
                triggerHoldStillHaptic()
                holdStillStartTime = Date()
                holdStillFrameCount = 0
            }
            noDetectionFrameCount = 0

        case .cropped, .error:
            stopHapticFeedback()
            triggerErrorHaptic()
            holdStillFrameCount = 0

        case .timeout:
            stopHapticFeedback()
            holdStillFrameCount = 0
            DispatchQueue.main.async {
                // Notify timeout
            }

        case .success:
            stopHapticFeedback()
        }

        // Setup debug view if enabled
        if MRZScanConfig.showDebugImageView {
            setupDebugImageView()
        }

        // Setup progress indicator
        setupProgressIndicator()

        // Setup hint label
        setupHintLabel()

        // Record scan start time
        scanStartTime = CACurrentMediaTime()
    }

    // MARK: - MRZ Text Overlay

    private func setupMRZTextOverlay() {
        guard MRZScanConfig.enableMRZOverlay else { return }

        let overlay = MRZTextOverlayView()
        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = .clear
        view.addSubview(overlay)

        // Position overlay to cover the entire preview area
        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        self.mrzTextOverlay = overlay

        // Set initial guide rect based on region of interest
        updateMRZOverlayGuideRect()

        // Set placeholder document type based on scanner ID type
        let docTypeString: String
        switch idType {
        case .passport:
            docTypeString = "passport"
        case .idCard:
            docTypeString = "id-card"
        case .residencePermit:
            docTypeString = "residence-permit"
        }
        overlay.setPlaceholderDocumentType(docTypeString)

        if MRZScanConfig.enableDebugLogging {
            print("VisionViewController: MRZ text overlay setup complete")
        }
    }

    private func updateMRZOverlayGuideRect() {
        guard let overlay = mrzTextOverlay else { return }

        // Calculate guide rect to match the SwiftUI MRZ guide box position
        // This uses the same contentConfig values as MrzScannerHostView
        
        let screenWidth = view.bounds.width
        let screenHeight = view.bounds.height

        let contentConfig = getContentConfig(idType: idType)
        
        let wireframeWidth: CGFloat = contentConfig.wireframeWidth
        let wireframeHeight: CGFloat = contentConfig.wireframeHeight
        let scanBoxBottom: CGFloat = contentConfig.scanBoxBottom
        let scanBoxWidth: CGFloat = contentConfig.scanBoxWidth
        let scanBoxHeight: CGFloat = contentConfig.scanBoxHeight
        let scanBoxLeftPadding: CGFloat = contentConfig.scanBoxLeftPadding

        let safeAreaTop = view.safeAreaInsets.top
        let safeAreaBottom = view.safeAreaInsets.bottom
        let availableHeight = screenHeight - safeAreaTop - safeAreaBottom
        
        // Calculate wireframe position (matching SwiftUI VStack layout)
        // VStack: Spacer(), wireframe, Spacer(40), Group(height:0), Spacer(100), Spacer()
        let fixedSpaceBelow: CGFloat = 40 + 100
        let wireframeTopWithinSafeArea = (availableHeight - wireframeHeight - fixedSpaceBelow) / 2
        let wireframeTop = safeAreaTop + wireframeTopWithinSafeArea
        let wireframeLeft = (screenWidth - wireframeWidth) / 2
        
        // Calculate MRZ box position within wireframe
        let mrzWidth = wireframeWidth * scanBoxWidth - scanBoxLeftPadding
        let mrzHeight = scanBoxHeight
        let mrzRelativeY = wireframeHeight - scanBoxBottom - mrzHeight
        
        // MRZ box position in screen coordinates
        let mrzX = wireframeLeft + scanBoxLeftPadding
        let mrzY = wireframeTop + mrzRelativeY
        
        let guideRect = CGRect(x: mrzX, y: mrzY, width: mrzWidth, height: mrzHeight)
        overlay.setGuideRect(guideRect)

        if MRZScanConfig.enableDebugLogging {
            print("VisionViewController: MRZ overlay guide rect updated")
            print("  - Guide rect: \(guideRect)")
            print("  - View bounds: \(view.bounds)")
            print("  - Safe area: top=\(safeAreaTop), bottom=\(safeAreaBottom)")
        }
    }

    // MARK: - Progress Indicator

    private func setupProgressIndicator() {
        // Create container with semi-transparent background
        let container = UIView()
        container.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        container.layer.cornerRadius = 12
        container.translatesAutoresizingMaskIntoConstraints = false
        container.alpha = 0  // Start hidden

        // Create progress label
        let label = UILabel()
        label.textColor = .white
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textAlignment = .center
        label.text = "Scanning...".localized(withComment: "MRZ Scanner")
        label.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(label)
        view.addSubview(container)

        // Constraints for container (bottom center, above the cutout)
        NSLayoutConstraint.activate([
            container.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            container.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            container.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),
            container.heightAnchor.constraint(equalToConstant: 44)
        ])

        // Constraints for label
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),
            label.centerYAnchor.constraint(equalTo: container.centerYAnchor)
        ])

        self.progressLabel = label
        self.progressContainerView = container
    }

    private func updateProgress(current: Int, required: Int) {
        guard let label = progressLabel, let container = progressContainerView else { return }

        if required > 0 && current > 0 {
            let percentage = min(100, Int((Float(current) / Float(required)) * 100))
            if percentage == 100 {
                label.text = "Nearly there...".localized(withComment: "MRZ Scanner")
            } else {
                label.text = String(format: "Scanning: %d%%".localized(withComment: "MRZ Scanner"), percentage)
            }

            // Show the container with animation if hidden
            if container.alpha == 0 {
                UIView.animate(withDuration: 0.2) {
                    container.alpha = 1
                }
            }

            // Change color based on progress
            if percentage >= 75 {
                label.textColor = UIColor.green
            } else {
                label.textColor = UIColor.white
            }
        } else {
            // Hide when no progress
            if container.alpha == 1 {
                UIView.animate(withDuration: 0.2) {
                    container.alpha = 0
                }
            }
        }
    }

    private func hideProgress() {
        guard let container = progressContainerView else { return }
        UIView.animate(withDuration: 0.3) {
            container.alpha = 0
        }
    }

    // MARK: - Hint System

    private func setupHintLabel() {
        // Create container with semi-transparent background
        let container = UIView()
        container.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        container.layer.cornerRadius = 10
        container.translatesAutoresizingMaskIntoConstraints = false
        container.alpha = 0  // Start hidden

        // Create hint label
        let label = UILabel()
        label.textColor = UIColor.orange
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.text = ""
        label.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(label)
        view.addSubview(container)

        // Constraints for container (top center, below safe area)
        NSLayoutConstraint.activate([
            container.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            container.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 60),
            container.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.9),
            container.heightAnchor.constraint(greaterThanOrEqualToConstant: 36)
        ])

        // Constraints for label
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),
            label.topAnchor.constraint(equalTo: container.topAnchor, constant: 8),
            label.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -8)
        ])

        self.hintLabel = label
        self.hintContainerView = container
    }

    private func analyzeBoxPositionsAndShowHint(greenBoxes: [CGRect], redBoxes: [CGRect]) {
        let currentTime = CACurrentMediaTime()

        // Don't show hints until after delay
        guard currentTime - scanStartTime >= hintDelaySeconds else { return }

        // Don't update hints too frequently
        guard currentTime - lastHintUpdateTime >= hintUpdateIntervalSeconds else { return }

        // Determine which boxes are "noise" (would have been filtered out)
        let roiWidth = regionOfInterest.width

        // Find boxes that are too narrow to be MRZ (less than 50% of ROI width)
        let noiseRedBoxes = redBoxes.filter { $0.width < roiWidth * 0.5 }

        // Find green boxes that have inconsistent widths
        let maxGreenWidth = greenBoxes.map { $0.width }.max() ?? 0
        let noiseGreenBoxes = greenBoxes.filter { $0.width < maxGreenWidth * 0.85 }

        // Combine all noise boxes
        let allNoiseBoxes = noiseRedBoxes + noiseGreenBoxes

        // If no noise boxes, hide hint
        guard !allNoiseBoxes.isEmpty else {
            hideHint()
            return
        }

        // Get the MRZ boxes (proper width green boxes)
        let mrzBoxes = greenBoxes.filter { $0.width >= maxGreenWidth * 0.85 }

        // If no MRZ boxes detected yet, just show generic hint
        guard !mrzBoxes.isEmpty else {
            showHint("Position MRZ in the frame".localized(withComment: "MRZ Scanner"))
            return
        }

        // Calculate average Y position of MRZ boxes and noise boxes
        // Note: In Vision coordinates, Y increases upward (bottom = 0, top = 1)
        let avgMrzY = mrzBoxes.map { $0.midY }.reduce(0, +) / CGFloat(mrzBoxes.count)
        let avgNoiseY = allNoiseBoxes.map { $0.midY }.reduce(0, +) / CGFloat(allNoiseBoxes.count)

        // Calculate average X position to detect if noise is on the sides
        let avgMrzX = mrzBoxes.map { $0.midX }.reduce(0, +) / CGFloat(mrzBoxes.count)
        let avgNoiseX = allNoiseBoxes.map { $0.midX }.reduce(0, +) / CGFloat(allNoiseBoxes.count)

        // Determine the hint based on noise position relative to MRZ
        let yDifference = avgNoiseY - avgMrzY
        let xDifference = abs(avgNoiseX - avgMrzX)

        // Check if noise is roughly at the same Y level as MRZ (within 10% of frame height)
        let isSameYLevel = abs(yDifference) < 0.1

        // Check if noise is significantly to the side
        let isOnSide = xDifference > 0.15

        if isSameYLevel && !isOnSide {
            // Noise is among the MRZ lines - user should move closer
            showHint("Move slightly closer to the ID".localized(withComment: "MRZ Scanner"))
        } else if yDifference > 0.15 {
            // Noise is above MRZ (higher Y in Vision coords)
            // In camera view (which is flipped), this means noise appears below
            // User should move camera down to exclude noise
            showHint("Move camera slightly down".localized(withComment: "MRZ Scanner"))
        } else if yDifference < -0.15 {
            // Noise is below MRZ (lower Y in Vision coords)
            // In camera view, this means noise appears above
            // User should move camera up to exclude noise
            showHint("Move camera slightly up".localized(withComment: "MRZ Scanner"))
        } else if isOnSide {
            // Noise is on the sides
            if avgNoiseX < avgMrzX {
                showHint("Move camera slightly right".localized(withComment: "MRZ Scanner"))
            } else {
                showHint("Move camera slightly left".localized(withComment: "MRZ Scanner"))
            }
        } else {
            // Generic hint
            showHint("Center the MRZ in the frame".localized(withComment: "MRZ Scanner"))
        }

        lastHintUpdateTime = currentTime
    }

    private func showHint(_ text: String) {
        guard let label = hintLabel, let container = hintContainerView else { return }

        DispatchQueue.main.async {
            label.text = text

            if container.alpha == 0 {
                UIView.animate(withDuration: 0.3) {
                    container.alpha = 1
                }
            }
        }
    }

    private func hideHint() {
        guard let container = hintContainerView else { return }

        DispatchQueue.main.async {
            if container.alpha == 1 {
                UIView.animate(withDuration: 0.3) {
                    container.alpha = 0
                }
            }
        }
    }

    // MARK: - MRZ Region Detection

    private func setupMRZDetection() {
        // Setup a fast Vision request just for detecting MRZ region
        mrzDetectionRequest = VNRecognizeTextRequest { [weak self] request, error in
            // Results handled in detectMRZRegion method
        }
        mrzDetectionRequest?.recognitionLevel = .fast
        mrzDetectionRequest?.usesLanguageCorrection = false
        mrzDetectionRequest?.recognitionLanguages = ["en-US"]
    }

    /// Detect MRZ region using Vision on raw pixel buffer (for correct UI coordinates)
    private func detectMRZRegionFromBuffer(_ pixelBuffer: CVPixelBuffer, completion: @escaping (CGRect?) -> Void) {
        let request = VNRecognizeTextRequest { [weak self] request, error in
            guard let self = self,
                  let observations = request.results as? [VNRecognizedTextObservation] else {
                completion(nil)
                return
            }

            // Collect bounding boxes for UI display
            var redBoxes = [CGRect]()   // Non-MRZ text
            var greenBoxes = [CGRect]() // MRZ-like text

            let bufferSize = CGSize(
                width: CGFloat(CVPixelBufferGetWidth(pixelBuffer)),
                height: CGFloat(CVPixelBufferGetHeight(pixelBuffer))
            )

            // Find MRZ-like text regions
            let mrzCandidates = self.findMRZCandidates(
                in: observations,
                imageSize: bufferSize,
                mrzBoxes: &greenBoxes,
                otherBoxes: &redBoxes
            )

            // Disabled filtering for green boxes and red boxes as the unlikely to be MRZ boxes
            // can be used as visual clues for the user (i.e. they should move their camera so they are not visible anymore)
            // Filter green boxes to only show those with similar widths (MRZ lines should be same width)
            //let filteredGreenBoxes = self.filterBoxesBySimilarWidth(greenBoxes)

            // Filter red boxes to only show those at least 50% of the ROI width
            // let roiWidth = self.regionOfInterest.width
            // let filteredRedBoxes = redBoxes.filter { $0.width >= roiWidth * 0.5 }

            // Draw bounding boxes on UI
            // Use full-image transform (no ROI scaling) since we detect on full buffer
            // self.showFullImageBoxes(boxGroups: [
            //     (color: UIColor.red.cgColor, boxes: filteredRedBoxes),
            //     (color: UIColor.green.cgColor, boxes: filteredGreenBoxes)
            // ])

            // Analyze box positions and show hints to guide user
            self.analyzeBoxPositionsAndShowHint(greenBoxes: greenBoxes, redBoxes: redBoxes)

            if let mrzBounds = mrzCandidates {
                // Update detection confidence
                if let lastBounds = self.lastDetectedMRZBounds,
                   self.boundsAreSimilar(lastBounds, mrzBounds) {
                    self.mrzDetectionConfidence += 1
                } else {
                    self.mrzDetectionConfidence = 1
                }
                self.lastDetectedMRZBounds = mrzBounds

                if MRZScanConfig.enableDebugLogging {
                    print("VisionViewController: MRZ region detected at \(mrzBounds), confidence: \(self.mrzDetectionConfidence)")
                }

                completion(mrzBounds)
            } else {
                self.mrzDetectionConfidence = 0
                completion(nil)
            }
        }

        request.recognitionLevel = .fast
        request.usesLanguageCorrection = false

        // Use textOrientation - this is the key! Same as legacy code
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: textOrientation, options: [:])

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                if MRZScanConfig.enableDebugLogging {
                    print("VisionViewController: MRZ detection failed: \(error)")
                }
                completion(nil)
            }
        }
    }

    /// Detect MRZ region from UIImage (for cropping - no UI drawing)
    private func detectMRZRegion(in image: UIImage, completion: @escaping (CGRect?) -> Void) {
        guard let cgImage = image.cgImage else {
            completion(nil)
            return
        }

        let request = VNRecognizeTextRequest { [weak self] request, error in
            guard let self = self,
                  let observations = request.results as? [VNRecognizedTextObservation] else {
                completion(nil)
                return
            }

            var mrzBoxes = [CGRect]()
            var otherBoxes = [CGRect]()

            let mrzCandidates = self.findMRZCandidates(
                in: observations,
                imageSize: image.size,
                mrzBoxes: &mrzBoxes,
                otherBoxes: &otherBoxes
            )

            completion(mrzCandidates)
        }

        request.recognitionLevel = .fast
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                if MRZScanConfig.enableDebugLogging {
                    print("VisionViewController: MRZ detection failed: \(error)")
                }
                completion(nil)
            }
        }
    }

    /// Find MRZ candidate regions from Vision observations
    private func findMRZCandidates(
        in observations: [VNRecognizedTextObservation],
        imageSize: CGSize,
        mrzBoxes: inout [CGRect],
        otherBoxes: inout [CGRect]
    ) -> CGRect? {
        // Filter for lines that look like MRZ
        var mrzLines: [(text: String, bounds: CGRect)] = []

        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }

            let text = candidate.string
                .uppercased()
                .replacingOccurrences(of: " ", with: "")

            // Check if this looks like an MRZ line
            if isMRZLikeLine(text) {
                // Vision coordinates (bottom-left origin, normalized)
                let bounds = observation.boundingBox
                debug(message: "MRZ-like text detected: \(text) at \(bounds)")
                mrzLines.append((text: text, bounds: bounds))
                mrzBoxes.append(bounds)
            } else {
                // Other detected text
                otherBoxes.append(observation.boundingBox)
            }
        }

        guard !mrzLines.isEmpty else { return nil }

        // Sort by Y position (bottom to top in Vision coordinates)
        mrzLines.sort { $0.bounds.origin.y < $1.bounds.origin.y }

        // Try to find TD3 (2 lines) or TD1 (3 lines) MRZ
        if let mrzBounds = findMRZGroup(from: mrzLines, expectedLines: 2, lineLength: 44) {
            return mrzBounds
        }

        if let mrzBounds = findMRZGroup(from: mrzLines, expectedLines: 3, lineLength: 30) {
            return mrzBounds
        }

        // Fallback: return bounds of all MRZ-like lines
        if mrzLines.count >= 2 {
            return combineBounds(mrzLines.map { $0.bounds })
        }

        return nil
    }

    /// Check if a text line looks like MRZ
    private func isMRZLikeLine(_ text: String) -> Bool {
        // MRZ lines are 30 chars (TD1) or 44 chars (TD3)
        guard text.count >= 28 && text.count <= 46 else { return false }

        // Check for high proportion of MRZ characters
        let mrzChars = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
        let mrzCharCount = text.filter { mrzChars.contains($0) }.count
        let mrzRatio = Float(mrzCharCount) / Float(text.count)

        // Should be mostly MRZ characters
        guard mrzRatio > 0.85 else { return false }

        // Should contain '<' (filler character)
        guard text.contains("<") else { return false }

        // Check for MRZ-like patterns
        let hasDocType = text.hasPrefix("P") || text.hasPrefix("I") || text.hasPrefix("A") || text.hasPrefix("C")
        let hasFillers = text.filter { $0 == "<" }.count >= 2

        return hasDocType || hasFillers
    }

    /// Find a group of MRZ lines with expected count and length
    private func findMRZGroup(from lines: [(text: String, bounds: CGRect)], expectedLines: Int, lineLength: Int) -> CGRect? {
        let tolerance = 4  // Allow some length variation

        let matchingLines = lines.filter { line in
            abs(line.text.count - lineLength) <= tolerance
        }

        guard matchingLines.count >= expectedLines else { return nil }

        // Find consecutive lines that are close together vertically
        var bestGroup: [(text: String, bounds: CGRect)] = []

        for i in 0..<matchingLines.count {
            var group = [matchingLines[i]]

            for j in (i + 1)..<matchingLines.count {
                let prevBounds = group.last!.bounds
                let currBounds = matchingLines[j].bounds

                // Check if lines are close vertically (within reasonable MRZ line spacing)
                let verticalGap = abs(currBounds.origin.y - (prevBounds.origin.y + prevBounds.height))
                let expectedGap = prevBounds.height * 0.5  // Lines should be close

                if verticalGap < expectedGap * 3 {
                    group.append(matchingLines[j])
                }

                if group.count >= expectedLines {
                    break
                }
            }

            if group.count >= expectedLines && group.count > bestGroup.count {
                bestGroup = Array(group.prefix(expectedLines))
            }
        }

        guard bestGroup.count >= expectedLines else { return nil }

        return combineBounds(bestGroup.map { $0.bounds })
    }

    /// Combine multiple bounding boxes into one
    private func combineBounds(_ bounds: [CGRect]) -> CGRect? {
        guard !bounds.isEmpty else { return nil }

        var minX = bounds[0].minX
        var minY = bounds[0].minY
        var maxX = bounds[0].maxX
        var maxY = bounds[0].maxY

        for rect in bounds.dropFirst() {
            minX = min(minX, rect.minX)
            minY = min(minY, rect.minY)
            maxX = max(maxX, rect.maxX)
            maxY = max(maxY, rect.maxY)
        }

        // Add some padding (10% on each side)
        let width = maxX - minX
        let height = maxY - minY
        let paddingX = width * 0.1
        let paddingY = height * 0.2

        return CGRect(
            x: max(0, minX - paddingX),
            y: max(0, minY - paddingY),
            width: min(1.0, width + paddingX * 2),
            height: min(1.0, height + paddingY * 2)
        )
    }

    /// Check if two bounds are similar (for confidence tracking)
    private func boundsAreSimilar(_ a: CGRect, _ b: CGRect, tolerance: CGFloat = 0.1) -> Bool {
        return abs(a.origin.x - b.origin.x) < tolerance &&
               abs(a.origin.y - b.origin.y) < tolerance &&
               abs(a.width - b.width) < tolerance &&
               abs(a.height - b.height) < tolerance
    }

    /// Filter boxes to only include those with similar widths, prioritizing widest boxes
    /// MRZ lines should all have the same width, so this filters out non-MRZ detections
    private func filterBoxesBySimilarWidth(_ boxes: [CGRect], widthTolerance: CGFloat = 0.15) -> [CGRect] {
        guard boxes.count > 1 else { return boxes }

        // Find the maximum width (MRZ should take most of the cropped region)
        let maxWidth = boxes.map { $0.width }.max() ?? 0

        // Filter to keep only boxes within tolerance of the max width
        let minAcceptableWidth = maxWidth * (1.0 - widthTolerance)

        let filteredBoxes = boxes.filter { box in
            box.width >= minAcceptableWidth
        }

        if MRZScanConfig.enableDebugLogging && filteredBoxes.count != boxes.count {
            print("VisionViewController: Filtered \(boxes.count - filteredBoxes.count) boxes with different widths (maxWidth: \(maxWidth), threshold: \(minAcceptableWidth))")
        }

        return filteredBoxes
    }

    // MARK: - Debug Image View

    private func setupDebugImageView() {
        // Create container with semi-transparent background
        let container = UIView()
        container.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        container.layer.cornerRadius = 8
        container.layer.borderWidth = 1
        container.layer.borderColor = UIColor.green.cgColor
        container.translatesAutoresizingMaskIntoConstraints = false
        container.isHidden = !MRZScanConfig.showDebugImageView

        // Create image view
        let imageView = UIImageView()
        imageView.contentMode = .scaleAspectFit
        imageView.backgroundColor = .clear
        imageView.translatesAutoresizingMaskIntoConstraints = false

        // Create label
        let label = UILabel()
        label.text = "OCR Input"
        label.textColor = .green
        label.font = .systemFont(ofSize: 10, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(imageView)
        container.addSubview(label)
        view.addSubview(container)

        // Constraints for container (bottom-left corner)
        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            container.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80),
            container.widthAnchor.constraint(equalToConstant: 160),
            container.heightAnchor.constraint(equalToConstant: 120)
        ])

        // Constraints for label
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: container.topAnchor, constant: 4),
            label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8)
        ])

        // Constraints for image view
        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 4),
            imageView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 4),
            imageView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -4),
            imageView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -4)
        ])

        // Add tap gesture to toggle visibility
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(toggleDebugView))
        container.addGestureRecognizer(tapGesture)
        container.isUserInteractionEnabled = true

        self.debugImageView = imageView
        self.debugContainerView = container
        self.isDebugViewVisible = true

        if MRZScanConfig.enableDebugLogging {
            print("VisionViewController: Debug image view setup complete")
        }
    }

    @objc private func toggleDebugView() {
        isDebugViewVisible.toggle()
        UIView.animate(withDuration: 0.2) {
            self.debugContainerView?.alpha = self.isDebugViewVisible ? 1.0 : 0.3
        }
    }

    private func showDebugImage(_ image: UIImage) {
        guard MRZScanConfig.showDebugImageView else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let imageView = self.debugImageView else { return }

            // Scale image for display using config values
            let maxDimension = MRZScanConfig.debugImageMaxSize
            let maxScale = MRZScanConfig.debugImageScale
            let scale = min(
                maxDimension / image.size.width,
                maxDimension / image.size.height,
                maxScale
            )

            let scaledSize = CGSize(
                width: max(image.size.width * scale, 1),
                height: max(image.size.height * scale, 1)
            )

            UIGraphicsBeginImageContextWithOptions(scaledSize, false, 0)
            image.draw(in: CGRect(origin: .zero, size: scaledSize))
            let scaledImage = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()

            imageView.image = scaledImage

            if MRZScanConfig.enableDebugLogging && self.processingFrameCount % 30 == 0 {
                print("VisionViewController: Debug image updated \(Int(scaledSize.width))x\(Int(scaledSize.height))")
            }
        }
    }

    private func imageOrientationFromCGOrientation(_ cgOrientation: CGImagePropertyOrientation) -> UIImage.Orientation {
        switch cgOrientation {
        case .up:
            return .up
        case .upMirrored:
            return .upMirrored
        case .down:
            return .down
        case .downMirrored:
            return .downMirrored
        case .left:
            return .left
        case .leftMirrored:
            return .leftMirrored
        case .right:
            return .right
        case .rightMirrored:
            return .rightMirrored
        }
    }


    // MARK: - Text recognition

    // Vision recognition handler.
    func recognizeTextHandler(request: VNRequest, error: Error?) {
        var redBoxes = [CGRect]()  // Shows all recognized text lines
        var greenBoxes = [CGRect]()  // Shows words that might be serials
        var codes = [String]()

        guard let results = request.results as? [VNRecognizedTextObservation] else {
            handleNoDetection()
            return
        }

        let maximumCandidates = 1
        for visionResult in results {
            guard let candidate = visionResult.topCandidates(maximumCandidates).first else { continue }

            var numberIsSubstring = true

            let candidateFormatted = candidate.string.replacingOccurrences(of: " ", with: "")

            if let result = candidateFormatted.checkMrz() {
                if result != "nil" {
                    codes.append(result)
                    numberIsSubstring = false

                    greenBoxes.append(visionResult.boundingBox)
                }
            }

            if numberIsSubstring {
                redBoxes.append(visionResult.boundingBox)
            }

        }

        // Update state based on detection
        if codes.isEmpty {
            handleNoDetection()
        } else {
            handleDetection()
        }

        // Log any found numbers.
        mrzTracker.logFrame(strings: codes)
        // Hide character detection boxes for cleaner UI
        // show(boxGroups: [
        //     (color: UIColor.red.cgColor, boxes: redBoxes),
        //     (color: UIColor.green.cgColor, boxes: greenBoxes),
        // ])

        // Check if we have any temporally stable numbers.
        if let sureNumber = mrzTracker.getStableString() {
            // Increment hold still frame count
            holdStillFrameCount += 1

            // Transition to holdStill state only after threshold
            if scanStatus != .holdStill && scanStatus != .success && holdStillFrameCount >= holdStillThreshold {
                DispatchQueue.main.async {
                    self.scanStatus = .holdStill
                }
            }

            // Check if we've held still long enough
            if scanStatus == .holdStill, let startTime = holdStillStartTime {
                let elapsed = Date().timeIntervalSince(startTime)
                if elapsed >= holdStillDuration {
                    showString(string: sureNumber)
                    mrzTracker.reset(string: sureNumber)

                    // Cancel timeout timer on success
                    cancelScanTimeout()

                    DispatchQueue.main.async {
                        self.scanStatus = .success
                        self.completionHandler?(.success(sureNumber))
                    }
                }
            }
        } else {
            // No stable string - reset hold still counter
            holdStillFrameCount = 0
        }
    }

    // MARK: - Detection State Helpers

    private func handleDetection() {
        lastDetectionTime = Date()

        // Reset no-detection counter since we're detecting
        noDetectionFrameCount = 0

        // Increment detection count
        detectingFrameCount += 1

        // Transition to detecting state after threshold
        if detectingFrameCount >= detectingThreshold && scanStatus == .initial {
            DispatchQueue.main.async {
                self.scanStatus = .detecting
            }
        } else if scanStatus == .cropped && detectingFrameCount >= detectingThreshold {
            // Only transition back from cropped after stable detection
            DispatchQueue.main.async {
                self.scanStatus = .detecting
            }
        }
    }

    private func handleNoDetection() {
        // Increment no-detection counter
        noDetectionFrameCount += 1

        // Check if we've gone too long without detection (timeout)
        if let lastTime = lastDetectionTime {
            let elapsed = Date().timeIntervalSince(lastTime)
            if elapsed > detectionTimeoutSeconds && scanStatus != .initial {
                DispatchQueue.main.async {
                    self.scanStatus = .timeout
                }
                return
            }
        }

        // Only transition to cropped after sustained no-detection
        if (scanStatus == .detecting || scanStatus == .holdStill) && noDetectionFrameCount >= noDetectionThreshold {
            DispatchQueue.main.async {
                self.scanStatus = .cropped
            }
            detectingFrameCount = 0
            holdStillStartTime = nil
            holdStillFrameCount = 0
        }
    }

    public override func captureOutput(
        _ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        if useEnhancedProcessing {
            // Use enhanced MRZ processing
            processWithEnhancedMRZ(sampleBuffer: sampleBuffer)
        } else {
            // Use legacy Vision processing
            if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
                // Configure for running in real-time.
                request.recognitionLevel = .fast
                // Language correction won't help recognizing phone numbers. It also
                // makes recognition slower.
                request.usesLanguageCorrection = false
                // Only run on the region of interest for maximum speed.
                request.regionOfInterest = regionOfInterest

                let requestHandler = VNImageRequestHandler(
                    cvPixelBuffer: pixelBuffer, orientation: textOrientation, options: [:])
                do {
                    try requestHandler.perform([request])
                } catch {
                    print(error)
                }
            }
        }
    }

    // MARK: - Bounding box drawing

    // Draw a box on screen. Must be called from main queue.
    var boxLayer = [CAShapeLayer]()
    func draw(rect: CGRect, color: CGColor) {
        let layer = CAShapeLayer()
        layer.opacity = 0.5
        layer.borderColor = color
        layer.borderWidth = 1
        layer.frame = rect
        boxLayer.append(layer)
        previewView.videoPreviewLayer.insertSublayer(layer, at: 1)
    }

    // Remove all drawn boxes. Must be called on main queue.
    func removeBoxes() {
        for layer in boxLayer {
            layer.removeFromSuperlayer()
        }
        boxLayer.removeAll()
    }

    typealias ColoredBoxGroup = (color: CGColor, boxes: [CGRect])

    // Draws groups of colored boxes.
    func show(boxGroups: [ColoredBoxGroup]) {
        DispatchQueue.main.async {
            let layer = self.previewView.videoPreviewLayer
            self.removeBoxes()
            for boxGroup in boxGroups {
                let color = boxGroup.color
                for box in boxGroup.boxes {
                    let rect = layer.layerRectConverted(
                        fromMetadataOutputRect: box.applying(self.visionToAVFTransform))
                    self.draw(rect: rect, color: color)
                }
            }
        }
    }

    // Draws boxes for full-image Vision detection (no ROI scaling)
    // Only shows boxes that fall within the region of interest
    func showFullImageBoxes(boxGroups: [ColoredBoxGroup]) {
        DispatchQueue.main.async {
            let layer = self.previewView.videoPreviewLayer
            self.removeBoxes()

            // Transform without ROI scaling - just bottom-to-top flip and rotation
            let fullImageTransform = self.bottomToTopTransform.concatenating(self.uiRotationTransform)

            // Get the ROI for filtering (in Vision coordinates - bottom-left origin)
            let roi = self.regionOfInterest

            for boxGroup in boxGroups {
                let color = boxGroup.color
                for box in boxGroup.boxes {
                    // Only draw boxes that intersect with the region of interest
                    if box.intersects(roi) {
                        let rect = layer.layerRectConverted(
                            fromMetadataOutputRect: box.applying(fullImageTransform))
                        self.draw(rect: rect, color: color)
                    }
                }
            }
        }
    }

    // MARK: - Enhanced MRZ Processing

    private func setupEnhancedProcessing() {
        // Enhanced processor is already initialized in viewDidLoad
    }

    private func processWithEnhancedMRZ(sampleBuffer: CMSampleBuffer) {
        // Skip if already processing
        guard !isProcessing else { return }

        let currentTime = CACurrentMediaTime()

        // Time-based frame limiting (similar to Android's minProcessingIntervalMs)
        if MRZScanConfig.minProcessingIntervalMs > 0 {
            let timeSinceLastProcessing = currentTime - lastProcessingTime
            if timeSinceLastProcessing < MRZScanConfig.minProcessingIntervalMs {
                return  // Skip this frame
            }
        }

        // Frame skipping (similar to Android's frameSkipCount)
        if MRZScanConfig.frameSkipCount > 0 {
            if processingFrameCount % (MRZScanConfig.frameSkipCount + 1) != 0 {
                processingFrameCount += 1
                return  // Skip this frame
            }
        }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        // Mark as processing and update timing
        isProcessing = true
        processingFrameCount += 1
        lastProcessingTime = currentTime

        if MRZScanConfig.enableDebugLogging && processingFrameCount % 10 == 0 {
            print("VisionViewController: Analyzing frame \(processingFrameCount)")
        }

        // Convert pixel buffer to UIImage with correct orientation
        // Camera buffer always comes in landscape, we need to apply the correct orientation
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            isProcessing = false
            return
        }

        // Apply orientation based on textOrientation (which accounts for device orientation)
        // textOrientation is set to .right for portrait mode, meaning rotate 90° clockwise
        let orientedImage = UIImage(cgImage: cgImage, scale: 1.0, orientation: imageOrientationFromCGOrientation(textOrientation))

        // Normalize orientation first
        let normalizedImage = normalizeImageOrientation(orientedImage)

        // Use Vision to detect MRZ region if enabled, otherwise use fixed ROI
        if MRZScanConfig.enableVisionMRZDetection {
            // Run Vision on raw buffer for UI bounding boxes (uses textOrientation for correct coords)
            detectMRZRegionFromBuffer(pixelBuffer) { _ in
                // UI boxes are drawn inside detectMRZRegionFromBuffer
            }

            // Run Vision on normalized image for cropping
            detectMRZRegion(in: normalizedImage) { [weak self] mrzBounds in
                guard let self = self else { return }

                let croppedImage: UIImage

                if let mrzBounds = mrzBounds {
                    // Crop to detected MRZ region
                    croppedImage = self.cropToNormalizedBounds(normalizedImage, bounds: mrzBounds)

                    if MRZScanConfig.enableDebugLogging {
                        print("VisionViewController: Using Vision-detected MRZ region")
                    }
                } else {
                    // Fallback to fixed region of interest
                    croppedImage = self.cropToRegionOfInterest(orientedImage)

                    if MRZScanConfig.enableDebugLogging {
                        print("VisionViewController: No MRZ detected, using fixed ROI")
                    }
                }

                // Process with enhanced processor
                self.enhancedProcessor.processImage(croppedImage, callback: self) { [weak self] processedImage in
                    // Mark processing as complete
                    self?.isProcessing = false

                    // Show processed image in debug view
                    if MRZScanConfig.showDebugImageView {
                        self?.showDebugImage(processedImage)
                    }
                }
            }
        } else {
            // Use fixed region of interest (faster, no Vision detection overhead)
            let croppedImage = cropToRegionOfInterest(orientedImage)

            // Process with enhanced processor
            enhancedProcessor.processImage(croppedImage, callback: self) { [weak self] processedImage in
                // Mark processing as complete
                self?.isProcessing = false

                // Show processed image in debug view
                if MRZScanConfig.showDebugImageView {
                    self?.showDebugImage(processedImage)
                }
            }
        }
    }

    /// Crop image to normalized bounds (Vision coordinates)
    private func cropToNormalizedBounds(_ image: UIImage, bounds: CGRect) -> UIImage {
        let imageSize = image.size

        // Convert Vision coordinates (origin at bottom-left) to UIKit (origin at top-left)
        let cropRect = CGRect(
            x: bounds.origin.x * imageSize.width,
            y: (1.0 - bounds.origin.y - bounds.height) * imageSize.height,
            width: bounds.width * imageSize.width,
            height: bounds.height * imageSize.height
        )

        // Ensure crop rect is within image bounds
        let safeRect = cropRect.intersection(CGRect(origin: .zero, size: imageSize))

        guard !safeRect.isEmpty,
              let cgImage = image.cgImage?.cropping(to: safeRect) else {
            return image
        }

        return UIImage(cgImage: cgImage)
    }

    private func cropToRegionOfInterest(_ image: UIImage) -> UIImage {
        // If ROI is full image, return as-is
        if regionOfInterest == CGRect(x: 0, y: 0, width: 1, height: 1) {
            return normalizeImageOrientation(image)
        }

        // First, normalize the image orientation so we're working with actual pixels
        let normalizedImage = normalizeImageOrientation(image)

        // Convert normalized ROI to image coordinates
        // The ROI is in Vision coordinates (origin at bottom-left, normalized 0-1)
        // We need to convert to UIKit coordinates (origin at top-left)
        let imageSize = normalizedImage.size
        let cropRect = CGRect(
            x: regionOfInterest.origin.x * imageSize.width,
            y: (1.0 - regionOfInterest.origin.y - regionOfInterest.height) * imageSize.height,  // Flip Y
            width: regionOfInterest.width * imageSize.width,
            height: regionOfInterest.height * imageSize.height
        )

        // Crop the image
        guard let cgImage = normalizedImage.cgImage?.cropping(to: cropRect) else {
            return normalizedImage
        }

        return UIImage(cgImage: cgImage)
    }

    /// Normalizes the image orientation by redrawing it
    private func normalizeImageOrientation(_ image: UIImage) -> UIImage {
        if image.imageOrientation == .up {
            return image
        }

        UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
        image.draw(in: CGRect(origin: .zero, size: image.size))
        let normalizedImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()

        return normalizedImage ?? image
    }

}

// MARK: - MRZProcessingCallback Extension

extension VisionViewController: MRZProcessingCallback {
    func onMRZExtracted(_ mrz: String, confidence: Float) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Hide progress indicator and hints
            self.hideProgress()
            self.hideHint()

            self.showString(string: mrz)
            self.completionHandler?(.success(mrz))
        }
    }

    func onMRZSeen() {
        // Visual feedback that MRZ is being processed
        DispatchQueue.main.async { [weak self] in
            // Could update UI to show scanning in progress
        }
    }

    func onMRZNotFound() {
        // Continue scanning
    }

    func onProcessingFrame() {
        // Frame is being processed
    }

    func onError(_ error: Error) {
        print("MRZ Processing Error: \(error)")
    }

    func onMRZLinesDetected(_ lines: [String]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Transition to detecting state when MRZ is first detected
            if self.scanStatus == .initial {
                self.scanStatus = .detecting
            }

            // Update MRZ text overlay with detected lines
            self.mrzTextOverlay?.updateMrzLines(lines)

            if MRZScanConfig.enableDebugLogging {
                print("Detected MRZ lines: \(lines.joined(separator: " | "))")
            }
        }
    }

    func onValidChecksumFrame() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Transition to holdStill when we have valid frames
            if self.scanStatus == .detecting {
                self.scanStatus = .holdStill
            }

            // Provide haptic feedback
            if MRZScanConfig.enableHapticFeedback {
                let impactFeedback = UIImpactFeedbackGenerator(style: .light)
                impactFeedback.prepare()
                impactFeedback.impactOccurred()
            }
        }
    }

    func onProgressUpdate(currentFrames: Int, requiredFrames: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Ensure we're in holdStill state when showing progress
            if currentFrames > 0 && self.scanStatus != .holdStill && self.scanStatus != .success {
                self.scanStatus = .holdStill
            }

            if currentFrames > 0 {
                // Restart the timeout timer when encountering valid frames
                self.cancelScanTimeout()
                self.startScanTimeout()
            }

            // Update SwiftUI progress bar
            self.progressCallback?(currentFrames, requiredFrames)

            // Update progress indicator (UIKit overlay - can be removed if not needed)
            // self.updateProgress(current: currentFrames, required: requiredFrames)

            if MRZScanConfig.enableDebugLogging {
                print("Progress: \(currentFrames)/\(requiredFrames) valid frames")
            }
        }
    }

    func onBestValidGroupMRZ(mrzLines: [String], mrz: String, confidence: Float) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Update overlay with best valid group and enable confirmation mode
            self.mrzTextOverlay?.updateMrzLines(mrzLines)
            self.mrzTextOverlay?.setConfirmationMode(true)

            if MRZScanConfig.enableDebugLogging {
                print("Best MRZ group found with confidence: \(confidence)")
            }
        }
    }

}

