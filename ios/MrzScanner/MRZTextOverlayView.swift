//
//  MRZTextOverlayView.swift
//  Custom view that overlays recognized MRZ text lines on the camera preview
//  Adapts to TD1 (3 lines) or TD3 (2 lines) format automatically
//

import UIKit

class MRZTextOverlayView: UIView {

    // MARK: - Types

    enum DocumentType {
        case td1    // 3 lines (ID cards)
        case td3    // 2 lines (passports)
        case unknown
    }

    private struct HighlightRanges {
        let importantFieldRanges: [ClosedRange<Int>]
        let checkDigitRanges: [ClosedRange<Int>]
    }

    // MARK: - Constants

    private static let placeholderTD3 = [
        "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
        "L898902C36UTO7408122F1204159ZE184226B<<<<<10"
    ]

    private static let placeholderTD1 = [
        "I<UTOD231458907<<<<<<<<<<<<<<<",
        "7408122F1204159UTO<<<<<<<<<<<6",
        "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"
    ]

    // MARK: - Paint Objects

    private lazy var textPaint: UIFont = {
        return UIFont.monospacedSystemFont(ofSize: calculatedTextSize, weight: .regular)
    }()

    private lazy var textColor: UIColor = {
        // Semi-transparent configured color (similar to Android alpha 220/255)
        let hex = MRZScanConfig.overlayTextColor
        let r = CGFloat((hex >> 16) & 0xFF) / 255.0
        let g = CGFloat((hex >> 8) & 0xFF) / 255.0
        let b = CGFloat(hex & 0xFF) / 255.0
        return UIColor(red: r, green: g, blue: b, alpha: 220.0 / 255.0)
    }()

    private lazy var dimmedTextColor: UIColor = {
        // Reduced opacity (30% of original, similar to Android alpha 66/255)
        let hex = MRZScanConfig.overlayTextColor
        let r = CGFloat((hex >> 16) & 0xFF) / 255.0
        let g = CGFloat((hex >> 8) & 0xFF) / 255.0
        let b = CGFloat(hex & 0xFF) / 255.0
        return UIColor(red: r, green: g, blue: b, alpha: 66.0 / 255.0)
    }()

    private lazy var overlayBackgroundColor: UIColor = {
        return UIColor.black.withAlphaComponent(0)
    }()

    private lazy var placeholderColor: UIColor = {
        return UIColor.white.withAlphaComponent(220.0 / 255.0)
    }()

    // MARK: - State

    private var calculatedTextSize: CGFloat = 0
    private var mrzLines: [String] = []
    private var documentType: DocumentType = .unknown
    private var isVisible: Bool = false
    private var showPlaceholder: Bool = true
    private var placeholderDocumentType: DocumentType = .td3
    private var isConfirmationMode: Bool = false
    private var guideRect: CGRect = .zero

    // MARK: - Initialization

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        backgroundColor = .clear
        isUserInteractionEnabled = false
        contentMode = .redraw
    }

    // MARK: - Public Methods

    /// Update the MRZ text overlay with new recognized lines
    func updateMrzLines(_ lines: [String]) {
        guard lines != mrzLines else { return }

        mrzLines = lines
        // Use placeholder document type if set, otherwise detect from lines
        // This ensures we use the correct type based on what the user is scanning
        if placeholderDocumentType != .unknown {
            documentType = placeholderDocumentType
        } else {
            documentType = detectDocumentType(lines)
        }
        isVisible = !lines.isEmpty && lines.contains { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        showPlaceholder = false

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: Updated MRZ overlay - Type: \(documentType), Lines: \(lines.count), Visible: \(isVisible)")
            for (index, line) in lines.enumerated() {
                let preview = line.prefix(20)
                print("  Line \(index + 1): '\(preview)\(line.count > 20 ? "..." : "")'")
            }
        }

        setNeedsDisplay()
    }

    /// Set the guide rectangle bounds for positioning the overlay
    func setGuideRect(_ rect: CGRect) {
        guideRect = rect
        recalculateTextSize()

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: Guide rect updated: \(rect), calculated text size: \(calculatedTextSize)")
        }

        setNeedsDisplay()
    }

    /// Clear the overlay
    func clearOverlay() {
        mrzLines = []
        documentType = .unknown
        isVisible = false
        showPlaceholder = true

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: MRZ overlay cleared, showing placeholder")
        }

        setNeedsDisplay()
    }

    /// Manually control placeholder visibility
    func setPlaceholderVisible(_ visible: Bool) {
        guard showPlaceholder != visible else { return }

        showPlaceholder = visible

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: Placeholder visibility set to: \(visible)")
        }

        setNeedsDisplay()
    }

    /// Set the document type for placeholder display
    func setPlaceholderDocumentType(_ documentType: String?) {
        let newType: DocumentType
        switch documentType?.uppercased() {
        case "TD1", "ID_CARD", "RESIDENCE_PERMIT", "ID-CARD", "RESIDENCE-PERMIT":
            newType = .td1
        case "TD3", "PASSPORT":
            newType = .td3
        default:
            newType = .td3
        }

        guard placeholderDocumentType != newType else { return }

        placeholderDocumentType = newType

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: Placeholder document type set to: \(newType) (from: '\(documentType ?? "nil")')")
        }

        setNeedsDisplay()
    }

    /// Set confirmation mode for enhanced background visibility
    func setConfirmationMode(_ enabled: Bool) {
        guard isConfirmationMode != enabled else { return }

        isConfirmationMode = enabled

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: Confirmation mode set to: \(enabled)")
        }

        setNeedsDisplay()
    }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        super.draw(rect)

        guard !guideRect.isEmpty, MRZScanConfig.enableMRZOverlay else { return }
        guard let context = UIGraphicsGetCurrentContext() else { return }

        // Determine what to draw: actual MRZ or placeholder
        let (linesToDraw, paintColor): ([String], UIColor)

        if isVisible && !mrzLines.isEmpty {
            // Draw actual MRZ lines
            let lines: [String]
            switch documentType {
            case .td1:
                lines = Array(mrzLines.prefix(3))
            case .td3:
                lines = Array(mrzLines.prefix(2))
            case .unknown:
                lines = Array(mrzLines.prefix(2))
            }
            paintColor = textColor
            linesToDraw = lines
        } else if showPlaceholder && MRZScanConfig.showPlaceholderMRZ {
            // Draw placeholder MRZ based on selected document type
            let placeholderLines: [String]
            switch placeholderDocumentType {
            case .td1:
                placeholderLines = Self.placeholderTD1
            case .td3:
                placeholderLines = Self.placeholderTD3
            case .unknown:
                placeholderLines = Self.placeholderTD3
            }
            paintColor = placeholderColor
            linesToDraw = placeholderLines
        } else {
            return
        }

        guard !linesToDraw.isEmpty else { return }

        // Determine the active document type for sizing
        let activeDocType = showPlaceholder ? placeholderDocumentType : documentType

        // Recalculate text size if needed
        recalculateTextSize(docType: activeDocType)

        let textMultiplier: CGFloat
        switch activeDocType {
        case .td1:
            textMultiplier = 1
        case .td3:
            textMultiplier = 1.03
        case .unknown:
            textMultiplier = 1.03
        }

        let fontSize = calculatedTextSize * textMultiplier
        let font = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)

        // Line spacing as a fraction of text size
        let lineSpacingFraction: CGFloat
        switch activeDocType {
        case .td1:
            lineSpacingFraction = 0
        case .td3:
            lineSpacingFraction = 0.3
        case .unknown:
            lineSpacingFraction = 0.3
        }

        let lineSpacing = fontSize * lineSpacingFraction

        // Calculate text metrics
        let attributes: [NSAttributedString.Key: Any] = [.font: font]
        let testString = "M" as NSString
        let textBounds = testString.boundingRect(with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude),
                                                   options: .usesLineFragmentOrigin,
                                                   attributes: attributes,
                                                   context: nil)

        let lineHeight = textBounds.height + lineSpacing
        let totalTextHeight = lineHeight * CGFloat(linesToDraw.count) - lineSpacing

        // Center the text block vertically within the guide rectangle
        let startY = guideRect.midY - (totalTextHeight / 2) + textBounds.height

        // Calculate text box dimensions
        let textWidth = getMaxLineWidth(linesToDraw, font: font)
        let textBoxWidth = textWidth + 16

        // Center the text box horizontally within the guide rectangle
        let textBoxStartX = guideRect.midX - (textBoxWidth / 2)
        let textStartX = textBoxStartX + 8

        // Draw background rectangle for better readability
        let shouldDrawBackground = (isVisible && !mrzLines.isEmpty) || isConfirmationMode

        if shouldDrawBackground {
            let backgroundRect: CGRect

            if isConfirmationMode {
                // Full guide rectangle for confirmation mode
                backgroundRect = guideRect
            } else {
                // Just around text for normal mode
                backgroundRect = CGRect(
                    x: textBoxStartX,
                    y: startY - lineHeight - 4,
                    width: textBoxWidth,
                    height: totalTextHeight + 8
                )
            }

            if isConfirmationMode {
                // More opaque background during confirmation mode (78% opacity)
                let confirmationBgColor = UIColor.black.withAlphaComponent(200.0 / 255.0)
                context.setFillColor(confirmationBgColor.cgColor)
                context.fill(backgroundRect)

                if MRZScanConfig.enableDebugLogging {
                    print("MRZTextOverlayView: Drew confirmation mode background covering entire guide rectangle")
                }
            } else {
                context.setFillColor(overlayBackgroundColor.cgColor)
                context.fill(backgroundRect)
            }
        }

        // Draw each line of MRZ text with field highlighting
        for (index, line) in linesToDraw.enumerated() {
            let y = startY + (CGFloat(index) * lineHeight)

            if isVisible && !showPlaceholder && isConfirmationMode {
                // Draw with highlighting in confirmation mode for actual MRZ
                drawLineWithHighlighting(context: context, line: line, x: textStartX, y: y, lineIndex: index, font: font)
            } else {
                // Draw normally (for placeholder and regular MRZ display)
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: font,
                    .foregroundColor: paintColor
                ]
                let nsString = line as NSString
                nsString.draw(at: CGPoint(x: textStartX, y: y - textBounds.height), withAttributes: attrs)
            }

            if showPlaceholder {
                if MRZScanConfig.enableDebugLogging && index == 0 {
                    print("MRZTextOverlayView: Drew placeholder line \(index + 1) at (\(Int(textStartX)), \(Int(y)))")
                }
            } else {
                if MRZScanConfig.enableDebugLogging && index == 0 {
                    let preview = line.prefix(10)
                    print("MRZTextOverlayView: Drew line \(index + 1) at (\(Int(textStartX)), \(Int(y))): '\(preview)...'")
                }
            }
        }
    }

    // MARK: - Private Methods

    private func detectDocumentType(_ lines: [String]) -> DocumentType {
        if lines.count >= 3 && lines.prefix(3).allSatisfy({ $0.count >= 25 }) {
            if MRZScanConfig.enableDebugLogging {
                print("MRZTextOverlayView: Detected TD1 format (3+ lines)")
            }
            return .td1
        } else if lines.count >= 2 && lines.prefix(2).allSatisfy({ $0.count >= 35 }) {
            if MRZScanConfig.enableDebugLogging {
                print("MRZTextOverlayView: Detected TD3 format (2+ lines)")
            }
            return .td3
        } else {
            if MRZScanConfig.enableDebugLogging {
                print("MRZTextOverlayView: Unknown document format")
            }
            return .unknown
        }
    }

    private func recalculateTextSize(docType: DocumentType = .td3) {
        guard !guideRect.isEmpty else {
            calculatedTextSize = MRZScanConfig.overlayTextSize
            return
        }

        // Target: text should fill ~92% of guide rectangle width
        let targetWidthFraction: CGFloat = 0.92
        let targetWidth = guideRect.width * targetWidthFraction

        // Reference MRZ line (TD3 passport has 44 chars)
        let referenceText = docType == .td3 ? "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<<" : "I<UTOD231458907<<<<<<<<<<<<<<<"

        // Binary search for optimal text size
        var lowSize: CGFloat = 4
        var highSize: CGFloat = 100
        var optimalSize: CGFloat = lowSize

        while highSize - lowSize > 0.5 {
            let midSize = (lowSize + highSize) / 2
            let font = UIFont.monospacedSystemFont(ofSize: midSize, weight: .regular)
            let attributes: [NSAttributedString.Key: Any] = [.font: font]
            let nsString = referenceText as NSString
            let size = nsString.size(withAttributes: attributes)

            if size.width <= targetWidth {
                optimalSize = midSize
                lowSize = midSize
            } else {
                highSize = midSize
            }
        }

        // Use the optimal size directly (no extra multiplier - multipliers applied in draw() if needed)
        calculatedTextSize = optimalSize

        if MRZScanConfig.enableDebugLogging {
            print("MRZTextOverlayView: Calculated text size: \(calculatedTextSize) for guide width: \(guideRect.width)")
        }
    }

    private func getMaxLineWidth(_ lines: [String], font: UIFont) -> CGFloat {
        let attributes: [NSAttributedString.Key: Any] = [.font: font]
        return lines.map { line in
            let nsString = line as NSString
            return nsString.size(withAttributes: attributes).width
        }.max() ?? 0
    }

    private func drawLineWithHighlighting(context: CGContext, line: String, x: CGFloat, y: CGFloat, lineIndex: Int, font: UIFont, characterSpacing: CGFloat = 0) {
        guard !line.isEmpty else { return }

        // Get highlight ranges based on document type and line index
        let highlightRanges = getHighlightRanges(lineIndex: lineIndex, lineLength: line.count)

        var currentX = x

        // Draw each character with appropriate color
        for (charIndex, char) in line.enumerated() {
            let isHighlighted = highlightRanges.importantFieldRanges.contains { $0.contains(charIndex) } ||
                               highlightRanges.checkDigitRanges.contains { $0.contains(charIndex) }

            let color = isHighlighted ? textColor : dimmedTextColor
            let attributes: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: color,
                .kern: characterSpacing
            ]

            let charString = String(char) as NSString
            let charSize = charString.size(withAttributes: attributes)

            charString.draw(at: CGPoint(x: currentX, y: y - charSize.height), withAttributes: attributes)
            currentX += charSize.width + characterSpacing
        }

        if MRZScanConfig.enableDebugLogging && lineIndex == 0 {
            print("MRZTextOverlayView: Drew line with opacity highlighting: \(highlightRanges.importantFieldRanges.count) important fields, \(highlightRanges.checkDigitRanges.count) check digits highlighted (normal opacity), others dimmed")
        }
    }

    private func getHighlightRanges(lineIndex: Int, lineLength: Int) -> HighlightRanges {
        var importantFieldRanges: [ClosedRange<Int>] = []
        var checkDigitRanges: [ClosedRange<Int>] = []

        switch documentType {
        case .td3:
            // TD3 format (passport, 2 lines)
            if lineIndex == 1 {
                // Second line (index 1)
                importantFieldRanges.append(0...8)   // Document number
                checkDigitRanges.append(9...9)       // Doc check digit
                importantFieldRanges.append(13...18) // DOB
                checkDigitRanges.append(19...19)     // DOB check digit
                importantFieldRanges.append(21...26) // Expiry
                checkDigitRanges.append(27...27)     // Expiry check digit
            }

        case .td1:
            // TD1 format (ID card, 3 lines)
            if lineIndex == 0 {
                // First line
                let line = mrzLines.first ?? ""
                if lineLength > 14 {
                    let checkChar = line.count > 14 ? line[line.index(line.startIndex, offsetBy: 14)] : " "
                    if checkChar == "<" {
                        // Extended format
                        importantFieldRanges.append(5...13)

                        var extendedEndPos = 14
                        for i in 15..<min(30, lineLength) {
                            if i < line.count {
                                let char = line[line.index(line.startIndex, offsetBy: i)]
                                if char != "<" {
                                    extendedEndPos = i
                                } else {
                                    break
                                }
                            }
                        }

                        if extendedEndPos > 14 {
                            importantFieldRanges.append(15...extendedEndPos-1)
                            checkDigitRanges.append(extendedEndPos...extendedEndPos)
                        }
                    } else {
                        // Standard format
                        importantFieldRanges.append(5...13)
                        if checkChar != "<" {
                            checkDigitRanges.append(14...14)
                        }
                    }
                } else {
                    importantFieldRanges.append(5...13)
                }
            } else if lineIndex == 1 {
                // Second line
                importantFieldRanges.append(0...5)   // DOB
                checkDigitRanges.append(6...6)       // DOB check digit
                importantFieldRanges.append(8...13)  // Expiry
                checkDigitRanges.append(14...14)     // Expiry check digit
            }

        case .unknown:
            // Try to detect format based on line content and apply TD3 rules as default
            if lineIndex == 1 && lineLength >= 44 {
                importantFieldRanges.append(0...8)   // Document number
                checkDigitRanges.append(9...9)       // Doc check digit
                importantFieldRanges.append(13...18) // DOB
                checkDigitRanges.append(19...19)     // DOB check digit
                importantFieldRanges.append(21...26) // Expiry
                checkDigitRanges.append(27...27)     // Expiry check digit
            }
        }

        if MRZScanConfig.enableDebugLogging && lineIndex == 0 {
            print("MRZTextOverlayView: Highlight ranges for line \(lineIndex) (\(documentType)): important=\(importantFieldRanges.count), checks=\(checkDigitRanges.count)")
        }

        return HighlightRanges(importantFieldRanges: importantFieldRanges, checkDigitRanges: checkDigitRanges)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        recalculateTextSize()
    }
}

