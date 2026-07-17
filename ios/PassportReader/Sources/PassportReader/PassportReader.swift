import Foundation
import AudioToolbox

#if !os(macOS)
import UIKit
import CoreNFC

@available(iOS 15, *)
public class PassportReader : NSObject {
    private typealias NFCCheckedContinuation = CheckedContinuation<NFCPassportModel, Error>
    private var nfcContinuation: NFCCheckedContinuation?

    private var passport : NFCPassportModel = NFCPassportModel()
    
    private var readerSession: NFCTagReaderSession?
    private var currentlyReadingDataGroup : DataGroupId?
    
    private var dataGroupsToRead : [DataGroupId] = []
    private var readAllDatagroups = false
    private var skipSecureElements = true
    private var skipCA = false
    private var skipPACE = false

    private var bacHandler : BACHandler?
    private var caHandler : ChipAuthenticationHandler?
    private var paceHandler : PACEHandler?
    private var mrzKey : String = ""
    private var dataAmountToReadOverride : Int? = nil
    
    private var scanCompletedHandler: ((NFCPassportModel?, PassportReaderError?)->())!
    private var nfcViewDisplayMessageHandler: ((NFCViewDisplayMessage) -> String?)?
    private var masterListURL : URL?
    private var shouldNotReportNextReaderSessionInvalidationErrorUserCanceled : Bool = false

    // By default, Passive Authentication uses the new RFS5652 method to verify the SOD, but can be switched to use
    // the previous OpenSSL CMS verification if necessary
    public var passiveAuthenticationUsesOpenSSL : Bool = false
    
    // MARK: - Haptic Feedback
    private var hapticTimer: Timer?
    private var lastReadDataGroup: DataGroupId?
    
    // MARK: - Session Restart State
    /// Number of times we've restarted polling after connection loss in current session
    private var sessionRestartCount: Int = 0
    /// Maximum number of restarts allowed before giving up
    private let maxSessionRestarts: Int = 3
    /// Original data groups requested (for reset on restart)
    private var originalDataGroupsToRead: [DataGroupId] = []
    /// Flag to indicate if we should restart polling on next error
    private var shouldRestartPollingOnError: Bool = true
    
    // MARK: - Data Group Caching for Connection Recovery
    /// Set of data group IDs that have been successfully read and cached
    /// These will be skipped on connection restart to avoid re-reading
    private var cachedDataGroupIds: Set<DataGroupId> = []
    /// Cached passport model to preserve data across connection restarts
    private var cachedPassportModel: NFCPassportModel?

    public init( logLevel: LogLevel = .info, masterListURL: URL? = nil ) {
        super.init()
        
        Log.logLevel = logLevel
        self.masterListURL = masterListURL
    }
    
    public func setMasterListURL( _ masterListURL : URL ) {
        self.masterListURL = masterListURL
    }
    
    // MARK: - Haptic Feedback Methods
    
    // System sound IDs for haptic feedback (work even when NFC modal is displayed)
    // These are undocumented but widely used sound IDs that produce haptic feedback
    private let kSystemSoundID_Peek: SystemSoundID = 1519      // Light tap
    private let kSystemSoundID_Pop: SystemSoundID = 1520       // Medium tap  
    private let kSystemSoundID_Cancelled: SystemSoundID = 1521 // Light tap (cancelled)
    private let kSystemSoundID_TryAgain: SystemSoundID = 1102  // Error/retry
    private let kSystemSoundID_Vibrate: SystemSoundID = 4095   // Standard vibration
    
    /// Trigger haptic feedback using AudioToolbox (works during NFC modal)
    /// Uses system sound IDs that produce haptic feedback even when app is in background modal state
    private func triggerSystemHaptic(_ soundID: SystemSoundID) {
        AudioServicesPlaySystemSound(soundID)
    }
    
    /// Start pulsing haptic feedback when chip is detected (every 1s)
    /// Purpose: Guide user to "stay in position"
    private func startChipDetectedHaptics() {
        Log.debug("startChipDetectedHaptics called")
        
        // Stop any existing haptic feedback first (synchronously to avoid race conditions)
        hapticTimer?.invalidate()
        hapticTimer = nil
        
        // Trigger initial haptic immediately using AudioToolbox (bypasses NFC modal suppression)
        Log.debug("startChipDetectedHaptics: triggering initial haptic")
        triggerSystemHaptic(kSystemSoundID_Peek)
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { 
                Log.debug("startChipDetectedHaptics: self is nil")
                return 
            }
            
            // Create timer and add to main RunLoop explicitly
            let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
                guard let self = self else { return }
                Log.debug("Haptic timer fired - triggering pulse")
                self.triggerSystemHaptic(self.kSystemSoundID_Peek)
            }
            
            self.hapticTimer = timer
            // Must add timer to RunLoop for it to fire
            RunLoop.main.add(timer, forMode: .common)
            Log.debug("startChipDetectedHaptics: timer scheduled")
        }
    }
    
    /// Short vibration when a new data group is read
    /// Purpose: Indicate state changing as label changes on modal
    private func triggerDataGroupReadHaptic() {
        Log.debug("triggerDataGroupReadHaptic called")
        triggerSystemHaptic(kSystemSoundID_Peek)
        Log.debug("triggerDataGroupReadHaptic: haptic triggered")
    }
    
    /// Double short vibration on error
    /// Purpose: Phone moved away from chip
    private func triggerErrorHaptic() {
        Log.debug("triggerErrorHaptic called")
        
        // First vibration
        triggerSystemHaptic(kSystemSoundID_Pop)
        Log.debug("triggerErrorHaptic: first haptic triggered")
        
        // Second vibration after 200ms
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self = self else { return }
            self.triggerSystemHaptic(self.kSystemSoundID_Pop)
            Log.debug("triggerErrorHaptic: second haptic triggered")
        }
    }
    
    /// Stop all haptic feedback
    private func stopHapticFeedback() {
        Log.debug("stopHapticFeedback called")
        hapticTimer?.invalidate()
        hapticTimer = nil
        Log.debug("stopHapticFeedback: timer invalidated")
    }
    
    // MARK: - Session Restart Methods
    
    /// Determines if an error is recoverable through restart polling
    /// - Parameter error: The error that occurred
    /// - Returns: true if the error is recoverable, false otherwise
    private func isRecoverableError(_ error: PassportReaderError) -> Bool {
        switch error {
        case .ConnectionError, .TagConnectionLost:
            return true
        case .ResponseError(let msg, _, _):
            // Connection-related response errors
            let connectionErrors = ["Session invalidated", "Tag connection lost", "Class not supported"]
            return connectionErrors.contains(msg)
        default:
            return false
        }
    }
    
    /// Determines if an NSError is a recoverable NFC communication error
    /// - Parameter error: The NSError that occurred
    /// - Returns: true if the error is recoverable, false otherwise
    private func isRecoverableNFCError(_ error: NSError) -> Bool {
        // NFCError code 102 is "Tag response error / no response"
        if error.domain == "NFCError" && error.code == 102 {
            return true
        }
        // Check for other connection-related errors
        let desc = error.localizedDescription.lowercased()
        return desc.contains("connection") || desc.contains("tag response") || desc.contains("no response")
    }
    
    /// Handles connection loss by restarting RF polling if possible
    /// This allows the user to reposition their device without dismissing the NFC modal
    /// - Parameter session: The current NFC tag reader session
    /// - Returns: true if restart polling was initiated, false if we should give up
    private func handleConnectionLossWithRestart(session: NFCTagReaderSession) -> Bool {
        // Check if we've exceeded max restarts
        guard sessionRestartCount < maxSessionRestarts else {
            Log.warning("handleConnectionLossWithRestart: Max restarts (\(maxSessionRestarts)) reached, giving up")
            return false
        }
        
        // Check if restart is enabled
        guard shouldRestartPollingOnError else {
            Log.debug("handleConnectionLossWithRestart: Restart polling disabled")
            return false
        }
        
        sessionRestartCount += 1
        Log.info("handleConnectionLossWithRestart: Restarting polling (attempt \(sessionRestartCount)/\(maxSessionRestarts))")
        
        // Stop current haptic feedback
        stopHapticFeedback()
        
        // Trigger error haptic to alert user
        triggerErrorHaptic()
        
        // Reset state for new tag detection
        resetStateForRestart()
        
        // Update the message to inform the user
        updateReaderSessionMessage(alertMessage: NFCViewDisplayMessage.retryingConnection(sessionRestartCount, maxSessionRestarts))
        
        // Restart RF polling - this keeps the modal open and waits for a new tag
        session.restartPolling()
        
        Log.debug("handleConnectionLossWithRestart: Polling restarted, waiting for tag...")
        return true
    }
    
    /// Resets internal state to prepare for a new tag detection after connection loss
    /// Preserves cached data groups to avoid re-reading them on reconnection
    private func resetStateForRestart() {
        Log.debug("resetStateForRestart: Resetting state for new tag detection (preserving \(cachedDataGroupIds.count) cached data groups)")
        
        // IMPORTANT: Preserve the passport model with cached data groups instead of creating fresh one
        // The cachedDataGroupIds set tracks which DGs have been successfully read and are in the passport
        // We don't create a new NFCPassportModel() here - we keep self.passport with its cached data
        
        // Reset data groups to read to original request
        self.dataGroupsToRead.removeAll()
        if self.originalDataGroupsToRead.isEmpty {
            // If no specific tags were requested, start with COM and SOD
            self.dataGroupsToRead.append(contentsOf: [.COM, .SOD])
            self.readAllDatagroups = true
        } else {
            self.dataGroupsToRead.append(contentsOf: self.originalDataGroupsToRead)
            self.readAllDatagroups = false
        }
        
        // Log which data groups are already cached and will be skipped
        if !cachedDataGroupIds.isEmpty {
            Log.info("resetStateForRestart: Cached data groups that will be skipped: \(cachedDataGroupIds.map { $0.getName() }.joined(separator: ", "))")
        }
        
        // Reset reading state
        self.currentlyReadingDataGroup = nil
        self.lastReadDataGroup = nil
        
        // Reset authentication handlers - will be recreated on next tag
        // Note: Authentication must be re-done on each new tag connection
        self.bacHandler = nil
        self.caHandler = nil
        self.paceHandler = nil
        
        Log.debug("resetStateForRestart: State reset complete, ready to resume reading remaining data groups")
    }
    
    // This function allows you to override the amount of data the TagReader tries to read from the NFC
    // chip. NOTE - this really shouldn't be used for production but is useful for testing as different
    // passports support different data amounts.
    // It appears that the most reliable is 0xA0 (160 chars) but some will support arbitary reads (0xFF or 256)
    public func overrideNFCDataAmountToRead( amount: Int ) {
        dataAmountToReadOverride = amount
    }
    
    public func readPassport( mrzKey : String, tags : [DataGroupId] = [], skipSecureElements : Bool = true, skipCA : Bool = true, skipPACE : Bool = false, isPacePolling : Bool = false, customDisplayMessage : ((NFCViewDisplayMessage) -> String?)? = nil) async throws -> NFCPassportModel {
        
        // IMPORTANT: Clean up any existing session before starting a new one to prevent
        // NFC subsystem corruption from overlapping sessions
        if readerSession != nil {
            Log.warning("readPassport called while a session was still active - cleaning up previous session")
            stopHapticFeedback() // Stop any haptic feedback from previous session
            readerSession?.invalidate()
            readerSession = nil
            // Cancel any pending continuation to prevent leaks
            nfcContinuation?.resume(throwing: PassportReaderError.UserCanceled)
            nfcContinuation = nil
            // Small delay to let the system clean up the previous session
            try? await Task.sleep(nanoseconds: 500_000_000) // 500ms
        }
        
        // Always ensure haptic feedback is stopped at the start of a new scan
        stopHapticFeedback()
        
        self.passport = NFCPassportModel()
        self.mrzKey = mrzKey
        self.skipCA = skipCA
        self.skipPACE = skipPACE
        
        self.dataGroupsToRead.removeAll()
        self.dataGroupsToRead.append( contentsOf:tags)
        self.originalDataGroupsToRead = tags // Store original request for potential restart
        self.nfcViewDisplayMessageHandler = customDisplayMessage
        self.skipSecureElements = skipSecureElements
        self.currentlyReadingDataGroup = nil
        self.bacHandler = nil
        self.caHandler = nil
        self.paceHandler = nil
        self.lastReadDataGroup = nil
        
        // Reset session restart tracking for new scan
        self.sessionRestartCount = 0
        self.shouldRestartPollingOnError = true
        
        // Reset data group caching for new scan
        self.cachedDataGroupIds.removeAll()
        self.cachedPassportModel = nil
        
        // If no tags specified, read all
        if self.dataGroupsToRead.count == 0 {
            // Start off with .COM, will always read (and .SOD but we'll add that after), and then add the others from the COM
            self.dataGroupsToRead.append(contentsOf:[.COM, .SOD] )
            self.readAllDatagroups = true
        } else {
            // We are reading specific datagroups
            self.readAllDatagroups = false
        }
        
        guard NFCNDEFReaderSession.readingAvailable else {
            throw PassportReaderError.NFCNotSupported
        }
        
        if NFCTagReaderSession.readingAvailable {
            // c.f. https://github.com/AndyQ/NFCPassportReader/issues/164#issuecomment-2139300643
            if #available(iOS 16, *) {
                if skipPACE {
                    print("Skipping PACE")
                    readerSession = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: nil)
                    
                    // Check if session creation failed - this can indicate NFC system failure
                    guard readerSession != nil else {
                        Log.error("Failed to create NFC session - possible NFC system failure")
                        throw PassportReaderError.NFCSystemFailure("Unable to create NFC session. The NFC system may be in a corrupted state. Please restart your device and try again.")
                    }
                } else {
                    print("Trying to read with iso14443 first")
                    // Try to read with iso14443 (or pace if isPacePolling is true) first
                    // and catch the error if it fails so we can try with pace option 
                    // before considering the error as an actual failure
                    readerSession = NFCTagReaderSession(pollingOption: isPacePolling ? .pace : .iso14443, delegate: self, queue: nil)
                    
                    // Check if session creation failed - this can indicate NFC system failure
                    guard readerSession != nil else {
                        Log.error("Failed to create NFC session - possible NFC system failure")
                        throw PassportReaderError.NFCSystemFailure("Unable to create NFC session. The NFC system may be in a corrupted state. Please restart your device and try again.")
                    }
                    
                    self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.requestPresentPassport )
                    readerSession?.begin()
                    do {
                        return try await withCheckedThrowingContinuation({ (continuation: NFCCheckedContinuation) in
                            self.nfcContinuation = continuation
                        })
                    } catch let error as PassportReaderError {
                        // Check if it's a File Not Found error (sw1: 0x6A, sw2: 0x82)
                        if case .ResponseError(_, let sw1, let sw2) = error, sw1 == 0x6A, sw2 == 0x82 {
                            Log.error("Failed to read passport with iso14443 due to File Not Found, trying with pace")
                            // Invalidate and clear the old session before creating a new one
                            readerSession?.invalidate()
                            readerSession = nil
                            // Clear the old continuation to prevent the old session's didInvalidateWithError
                            // from resuming it after we set a new one
                            nfcContinuation = nil
                            // Wait for 5 seconds before trying again, so the previous modal is dismissed
                            try? await Task.sleep(nanoseconds: 5_000_000_000)
                            readerSession = NFCTagReaderSession(pollingOption: .pace, delegate: self, queue: nil)
                            
                            // Check if retry session creation failed
                            guard readerSession != nil else {
                                Log.error("Failed to create NFC session on retry - possible NFC system failure")
                                throw PassportReaderError.NFCSystemFailure("Unable to create NFC session. The NFC system may be in a corrupted state. Please restart your device and try again.")
                            }
                            
                            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.requestPresentPassportAgain )
                            readerSession?.begin()
                            return try await withCheckedThrowingContinuation({ (continuation: NFCCheckedContinuation) in
                                self.nfcContinuation = continuation
                            })
                        }
                        throw error
                    }
                }
            } else {
                print("Using iso14443")
                readerSession = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: nil)
                
                // Check if session creation failed - this can indicate NFC system failure
                guard readerSession != nil else {
                    Log.error("Failed to create NFC session - possible NFC system failure")
                    throw PassportReaderError.NFCSystemFailure("Unable to create NFC session. The NFC system may be in a corrupted state. Please restart your device and try again.")
                }
            }

            
            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.requestPresentPassport )
            readerSession?.begin()
        }
        
        return try await withCheckedThrowingContinuation({ (continuation: NFCCheckedContinuation) in
            self.nfcContinuation = continuation
        })
    }
}

@available(iOS 15, *)
extension PassportReader : NFCTagReaderSessionDelegate {
    // MARK: - NFCTagReaderSessionDelegate
    public func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {
        // If necessary, you may perform additional operations on session start.
        // At this point RF polling is enabled.
        Log.debug( "tagReaderSessionDidBecomeActive" )
    }
    
    public func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        // If necessary, you may handle the error. Note session is no longer valid.
        // You must create a new session to restart RF polling.
        Log.debug( "tagReaderSession:didInvalidateWithError - \(error.localizedDescription)" )
        
        // Stop haptic feedback when session ends
        self.stopHapticFeedback()
        
        // IMPORTANT: Do NOT call invalidate() here - the session is already invalidated by the system
        // when this delegate method is called. Calling invalidate() on an already-invalidated session
        // can corrupt the NFC subsystem and cause system-wide NFC failures requiring a device restart.
        self.readerSession = nil

        if let readerError = error as? NFCReaderError, readerError.code == NFCReaderError.readerSessionInvalidationErrorUserCanceled
            && self.shouldNotReportNextReaderSessionInvalidationErrorUserCanceled {
            
            self.shouldNotReportNextReaderSessionInvalidationErrorUserCanceled = false
        } else {
            var userError: PassportReaderError = PassportReaderError.UnexpectedError
            if let readerError = error as? NFCReaderError {
                Log.error( "tagReaderSession:didInvalidateWithError - Got NFCReaderError - code: \(readerError.code.rawValue), description: \(readerError.localizedDescription)" )
                switch (readerError.code) {
                case NFCReaderError.readerSessionInvalidationErrorUserCanceled:
                    Log.error( "     - User cancelled session" )
                    userError = PassportReaderError.UserCanceled
                case NFCReaderError.readerSessionInvalidationErrorSystemIsBusy:
                    // NFC system is busy - this can indicate the system is in a bad state
                    Log.error( "     - NFC System is busy - at this stage it's likely a WiFi interference issue" )
                    userError = PassportReaderError.WiFiInterference
                case NFCReaderError.readerTransceiveErrorTagConnectionLost:
                    Log.error( "     - Tag connection lost" )
                    userError = PassportReaderError.ConnectionError
                case NFCReaderError.readerTransceiveErrorTagResponseError:
                    Log.error( "     - Tag response error" )
                    userError = PassportReaderError.ConnectionError
                case NFCReaderError.readerSessionInvalidationErrorFirstNDEFTagRead:
                    Log.error( "     - First NDEF tag read error" )
                    userError = PassportReaderError.UnexpectedError
                default:
                    // Check for other signs of system-level failure
                    let errorDesc = readerError.localizedDescription.lowercased()
                    if errorDesc.contains("system") || errorDesc.contains("unavailable") || errorDesc.contains("internal error") {
                        Log.error( "     - Possible NFC system failure detected: \(readerError.localizedDescription)" )
                        userError = PassportReaderError.NFCSystemFailure("NFC system error: \(readerError.localizedDescription). Please restart your device and try again.")
                    } else {
                        Log.error( "     - some other error - \(readerError.localizedDescription)" )
                        userError = PassportReaderError.UnexpectedError
                    }
                }
            } else {
                // Check for system-level failure indicators in non-NFCReaderError errors
                let errorDesc = error.localizedDescription.lowercased()
                Log.error( "tagReaderSession:didInvalidateWithError - Received non-NFC error - \(error.localizedDescription)" )
                
                if errorDesc.contains("system") || errorDesc.contains("unavailable") || errorDesc.contains("internal") || errorDesc.contains("busy") {
                    Log.error( "     - Possible NFC system failure detected" )
                    userError = PassportReaderError.NFCSystemFailure("NFC system error: \(error.localizedDescription). Please restart your device and try again.")
                }
            }
            nfcContinuation?.resume(throwing: userError)
            nfcContinuation = nil
        }
    }
    
    public func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        Log.debug( "tagReaderSession:didDetect - \(tags[0])" )
        if tags.count > 1 {
            Log.debug( "tagReaderSession:more than 1 tag detected! - \(tags)" )

            let errorMessage = NFCViewDisplayMessage.error(.MoreThanOneTagFound)
            self.invalidateSession(errorMessage: errorMessage, error: PassportReaderError.MoreThanOneTagFound)
            return
        }

        let tag = tags.first!
        var passportTag: NFCISO7816Tag
        switch tags.first! {
        case let .iso7816(tag):
            passportTag = tag
        default:
            Log.debug( "tagReaderSession:invalid tag detected!!!" )

            let errorMessage = NFCViewDisplayMessage.error(PassportReaderError.TagNotValid)
            self.invalidateSession(errorMessage:errorMessage, error: PassportReaderError.TagNotValid)
            return
        }
        
        Task { [passportTag] in
            do {
                try await session.connect(to: tag)
                
                Log.debug( "tagReaderSession:connected to tag - starting authentication" )
                
                // Start pulsing haptic feedback to guide user to "stay in position"
                self.startChipDetectedHaptics()
                
                // If this is a reconnection after connection loss, show the reconnected message briefly
                if self.sessionRestartCount > 0 {
                    Log.info("Tag re-detected after connection loss (attempt \(self.sessionRestartCount))")
                    self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.tagReconnected )
                    // Brief delay to show the reconnected message before continuing
                    try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                }
                
                self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.authenticatingWithPassport(0) )
                
                let tagReader = TagReader(tag:passportTag)
                
                if let newAmount = self.dataAmountToReadOverride {
                    tagReader.overrideDataAmountToRead(newAmount: newAmount)
                }
                
                tagReader.progress = { [unowned self] (progress) in
                    if let dgId = self.currentlyReadingDataGroup {
                        self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.readingDataGroupProgress(dgId, progress) )
                    } else {
                        self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.authenticatingWithPassport(progress) )
                    }
                }
                
                let passportModel = try await self.startReading( tagReader : tagReader)
                nfcContinuation?.resume(returning: passportModel)
                nfcContinuation = nil

                
            } catch let error as PassportReaderError {
                Log.error("tagReaderSession:didDetect - PassportReaderError: \(error.value)")
                self.stopHapticFeedback()
                
                // Check if this is a recoverable error that we can handle by restarting polling
                if self.isRecoverableError(error) {
                    Log.info("tagReaderSession:didDetect - Recoverable error detected, attempting restart polling")
                    if self.handleConnectionLossWithRestart(session: session) {
                        // Successfully initiated restart - don't invalidate session or resume continuation
                        // The session will call didDetect again when a new tag is found
                        Log.debug("tagReaderSession:didDetect - Restart polling initiated, waiting for new tag")
                        return
                    }
                    // Failed to restart (max retries exceeded), fall through to invalidate
                    Log.warning("tagReaderSession:didDetect - Failed to restart polling, invalidating session")
                }
                
                // Non-recoverable error or max restarts exceeded - invalidate session
                self.triggerErrorHaptic()
                let errorMessage = NFCViewDisplayMessage.error(error)
                self.invalidateSession(errorMessage: errorMessage, error: error)
                
            } catch let error as NSError {
                Log.error("tagReaderSession:didDetect - NSError: domain=\(error.domain), code=\(error.code), desc=\(error.localizedDescription)")
                self.stopHapticFeedback()
                
                // Check if this is a recoverable NFC communication error
                if self.isRecoverableNFCError(error) {
                    Log.info("tagReaderSession:didDetect - Recoverable NFC error detected, attempting restart polling")
                    if self.handleConnectionLossWithRestart(session: session) {
                        // Successfully initiated restart
                        Log.debug("tagReaderSession:didDetect - Restart polling initiated after NFC error")
                        return
                    }
                    Log.warning("tagReaderSession:didDetect - Failed to restart polling after NFC error")
                }
                
                // Non-recoverable error or max restarts exceeded
                self.triggerErrorHaptic()
                Log.debug( "tagReaderSession:failed to connect to tag - \(error.localizedDescription)" )
                let errorMessage = NFCViewDisplayMessage.error(PassportReaderError.ConnectionError)
                self.invalidateSession(errorMessage: errorMessage, error: PassportReaderError.ConnectionError)
                
            } catch let error {
                Log.error("tagReaderSession:didDetect - Unknown error: \(error.localizedDescription)")
                self.stopHapticFeedback()
                self.triggerErrorHaptic()
                nfcContinuation?.resume(throwing: error)
                nfcContinuation = nil
                Log.debug( "tagReaderSession:failed to connect to tag - \(error.localizedDescription)" )
                let errorMessage = NFCViewDisplayMessage.error(PassportReaderError.ConnectionError)
                self.invalidateSession(errorMessage: errorMessage, error: PassportReaderError.ConnectionError)
            }
        }
    }
    
    func updateReaderSessionMessage(alertMessage: NFCViewDisplayMessage ) {
        self.readerSession?.alertMessage = self.nfcViewDisplayMessageHandler?(alertMessage) ?? alertMessage.description
    }
}

@available(iOS 15, *)
extension PassportReader {
    
    func startReading(tagReader : TagReader) async throws -> NFCPassportModel {

        if !skipPACE {
            do {
                let data = try await tagReader.readCardAccess()
                Log.verbose( "Read CardAccess - data (\(data.count) bytes): \(binToHexRep(data))" )
                
                // Validate CardAccess data - must be at least a few bytes to contain valid ASN.1 structure
                guard data.count >= 10 else {
                    Log.warning("CardAccess data too small (\(data.count) bytes) - likely not valid PACE parameters")
                    throw PassportReaderError.InvalidDataPassed("CardAccess data too small to contain valid PACE parameters")
                }
                
                let cardAccess = try CardAccess(data)
                passport.cardAccess = cardAccess
     
                Log.info( "Starting Password Authenticated Connection Establishment (PACE)" )
                 
                let paceHandler = try PACEHandler( cardAccess: cardAccess, tagReader: tagReader )
                try await paceHandler.doPACE(mrzKey: mrzKey )
                passport.PACEStatus = .success
                Log.debug( "PACE Succeeded" )
            } catch let error as NSError {
                // Check if this is a connection error during PACE
                if error.domain == "NFCError" || error.localizedDescription.lowercased().contains("connection") {
                    Log.error("Connection error during PACE - throwing TagConnectionLost")
                    throw PassportReaderError.TagConnectionLost
                }
                passport.PACEStatus = .failed
                Log.error( "PACE Failed with NSError: \(error.localizedDescription) - falling back to BAC" )
            } catch {
                passport.PACEStatus = .failed
                Log.error( "PACE Failed with error: \(error) - falling back to BAC" )
            }
            
            do {
                _ = try await tagReader.selectPassportApplication()
            } catch let error as NSError {
                if error.domain == "NFCError" {
                    Log.error("Connection error during selectPassportApplication - throwing TagConnectionLost")
                    throw PassportReaderError.TagConnectionLost
                }
                throw error
            }
        }
        
        // If either PACE isn't supported, we failed whilst doing PACE or we didn't even attempt it, then fall back to BAC
        if passport.PACEStatus != .success {
            do {
                try await doBACAuthentication(tagReader : tagReader)
            } catch let error as PassportReaderError {
                // Check if this is a connection error during BAC
                if case .InvalidMRZKey = error {
                    // Invalid MRZ is not a connection error - propagate as-is
                    throw error
                }
                // Other errors during BAC are likely connection issues
                Log.error("Error during BAC authentication: \(error.value) - checking if connection error")
                if error.value.lowercased().contains("connection") || error.value.lowercased().contains("tag") {
                    throw PassportReaderError.TagConnectionLost
                }
                throw error
            } catch let error as NSError {
                if error.domain == "NFCError" {
                    Log.error("NFC error during BAC authentication - throwing TagConnectionLost")
                    throw PassportReaderError.TagConnectionLost
                }
                throw error
            }
        }
        
        // Now to read the datagroups
        try await readDataGroups(tagReader: tagReader)
        
        // Stop pulsing haptic feedback on successful completion
        self.stopHapticFeedback()
        
        self.updateReaderSessionMessage(alertMessage: NFCViewDisplayMessage.successfulRead)

        //try await doActiveAuthenticationIfNeccessary(tagReader : tagReader)
        self.shouldNotReportNextReaderSessionInvalidationErrorUserCanceled = true
        self.readerSession?.invalidate()
        // Immediately set to nil to prevent stale references and ensure clean state
        self.readerSession = nil

        // If we have a masterlist url set then use that and verify the passport now
        self.passport.verifyPassport(masterListURL: self.masterListURL, useCMSVerification: self.passiveAuthenticationUsesOpenSSL)

        return self.passport
    }
    
    func hexStringToBytes(_ hex: String) -> [UInt8] {
        var start = hex.startIndex
        var bytes = [UInt8]()
        while start < hex.endIndex {
            let end = hex.index(start, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            let byteString = hex[start..<end]
            if let byte = UInt8(byteString, radix: 16) {
                bytes.append(byte)
            }
            start = end
        }
        return bytes
    }
    
    func doActiveAuthenticationIfNeccessary( tagReader : TagReader) async throws {
        guard self.passport.activeAuthenticationSupported else {
            return
        }
        
        Log.info( "Performing Active Authentication" )
        
//        let challenge = generateRandomUInt8Array(8)
        let challenge = hexStringToBytes("000000006502d67b")
        
        Log.verbose( "Generated Active Authentication challange - \(binToHexRep(challenge))")
        let responseData = try await tagReader.doInternalAuthentication(challenge: challenge)
        self.passport.verifyActiveAuthentication( challenge:challenge, signature: responseData )
    }
    

    func doBACAuthentication(tagReader : TagReader) async throws {
        self.currentlyReadingDataGroup = nil
        
        Log.info( "Starting Basic Access Control (BAC)" )
        
        self.passport.BACStatus = .failed

        self.bacHandler = BACHandler( tagReader: tagReader )
        try await bacHandler?.performBACAndGetSessionKeys( mrzKey: mrzKey )
        Log.info( "Basic Access Control (BAC) - SUCCESS!" )

        self.passport.BACStatus = .success
    }
    
    /// Re-authenticates with the passport chip using PACE first (if not skipped), falling back to BAC.
    /// This mirrors the initial authentication flow and should be used when recovering from connection errors.
    func doReauthentication(tagReader : TagReader) async throws {
        self.currentlyReadingDataGroup = nil
        Log.info( "Re-authenticating with passport chip..." )
        
        if !skipPACE {
            do {
                let data = try await tagReader.readCardAccess()
                Log.verbose( "Read CardAccess - data \(binToHexRep(data))" )
                let cardAccess = try CardAccess(data)
                passport.cardAccess = cardAccess
     
                Log.info( "Re-attempting Password Authenticated Connection Establishment (PACE)" )
                 
                let paceHandler = try PACEHandler( cardAccess: cardAccess, tagReader: tagReader )
                try await paceHandler.doPACE(mrzKey: mrzKey )
                passport.PACEStatus = .success
                Log.debug( "PACE Succeeded on re-authentication" )
            } catch {
                passport.PACEStatus = .failed
                Log.error( "PACE Failed on re-authentication - falling back to BAC" )
            }
            
            _ = try await tagReader.selectPassportApplication()
        }
        
        // If either PACE isn't supported, we failed whilst doing PACE or we didn't even attempt it, then fall back to BAC
        if passport.PACEStatus != .success {
            try await doBACAuthentication(tagReader : tagReader)
        }
        
        Log.info( "Re-authentication successful" )
    }

    func readDataGroups( tagReader: TagReader ) async throws {
        
        // Read COM (check cache first)
        var DGsToRead = [DataGroupId]()

        if cachedDataGroupIds.contains(.COM) {
            Log.info("readDataGroups: COM already cached, skipping read")
            // COM is cached, we need to get the DGs list from the cached passport
            if let com = self.passport.dataGroupsRead[.COM] as? COM {
                DGsToRead = [.SOD] + com.dataGroupsPresent.map { DataGroupId.getIDFromName(name:$0) }
                DGsToRead.removeAll { $0 == .COM }
            }
        } else {
            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.readingDataGroupProgress(.COM, 0) )
            if let com = try await readDataGroup(tagReader:tagReader, dgId:.COM) as? COM {
                self.passport.addDataGroup( .COM, dataGroup:com )
                // Mark COM as successfully cached
                self.cachedDataGroupIds.insert(.COM)
                Log.info("readDataGroups: COM successfully read and cached")
            
                // SOD and COM shouldn't be present in the DG list but just in case (worst case here we read the sod twice)
                DGsToRead = [.SOD] + com.dataGroupsPresent.map { DataGroupId.getIDFromName(name:$0) }
                
                // CUSTOM:
    //            DGsToRead = [.SOD, .DG1, .DG15]
                DGsToRead.removeAll { $0 == .COM }
            }
        }
        
        if DGsToRead.contains( .DG14 ) {
            DGsToRead.removeAll { $0 == .DG14 }
            
            if !skipCA {
                // Check if DG14 is already cached
                if cachedDataGroupIds.contains(.DG14) {
                    Log.info("readDataGroups: DG14 already cached, skipping read")
                    // DG14 is cached, but we still need to attempt chip authentication
                    if let dg14 = self.passport.dataGroupsRead[.DG14] as? DataGroup14 {
                        let caHandler = ChipAuthenticationHandler(dg14: dg14, tagReader: tagReader)
                        if caHandler.isChipAuthenticationSupported {
                            do {
                                try await caHandler.doChipAuthentication()
                                self.passport.chipAuthenticationStatus = .success
                            } catch {
                                Log.info( "Chip Authentication failed - re-authenticating")
                                self.passport.chipAuthenticationStatus = .failed
                                try await doReauthentication(tagReader: tagReader)
                            }
                        }
                    }
                } else {
                    // Do Chip Authentication
                    if let dg14 = try await readDataGroup(tagReader:tagReader, dgId:.DG14) as? DataGroup14 {
                        self.passport.addDataGroup( .DG14, dataGroup:dg14 )
                        // Mark DG14 as successfully cached
                        self.cachedDataGroupIds.insert(.DG14)
                        Log.info("readDataGroups: DG14 successfully read and cached")
                        
                        let caHandler = ChipAuthenticationHandler(dg14: dg14, tagReader: tagReader)
                         
                        if caHandler.isChipAuthenticationSupported {
                            do {
                                // Do Chip authentication and then continue reading datagroups
                                try await caHandler.doChipAuthentication()
                                self.passport.chipAuthenticationStatus = .success
                            } catch {
                                Log.info( "Chip Authentication failed - re-authenticating")
                                self.passport.chipAuthenticationStatus = .failed
                                
                                // Failed Chip Auth, need to re-authenticate (PACE first, then BAC fallback)
                                try await doReauthentication(tagReader: tagReader)
                            }
                        }
                    }
                }
            }
        }

        // If we are skipping secure elements then remove .DG3 and .DG4
        if self.skipSecureElements {
            DGsToRead = DGsToRead.filter { $0 != .DG3 && $0 != .DG4 }
        }

        // Skip reading Signature (autograph)
        DGsToRead = DGsToRead.filter { $0 != .DG7 }

        if self.readAllDatagroups != true {
            DGsToRead = DGsToRead.filter { dataGroupsToRead.contains($0) }
        }
        
        // Filter out already cached data groups to avoid re-reading
        let uncachedDGs = DGsToRead.filter { !cachedDataGroupIds.contains($0) }
        if uncachedDGs.count < DGsToRead.count {
            let skippedDGs = DGsToRead.filter { cachedDataGroupIds.contains($0) }
            Log.info("readDataGroups: Skipping \(skippedDGs.count) already cached data groups: \(skippedDGs.map { $0.getName() }.joined(separator: ", "))")
        }
        
        for dgId in uncachedDGs {
            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.readingDataGroupProgress(dgId, 0) )
            if let dg = try await readDataGroup(tagReader:tagReader, dgId:dgId) {
                self.passport.addDataGroup( dgId, dataGroup:dg )
                // Mark this data group as successfully cached
                self.cachedDataGroupIds.insert(dgId)
                Log.info("readDataGroups: \(dgId.getName()) successfully read and cached")
            }
        }
    }
    
    func readDataGroup( tagReader : TagReader, dgId : DataGroupId ) async throws -> DataGroup?  {

        self.currentlyReadingDataGroup = dgId
        Log.info( "Reading tag - \(dgId)" )
        var readAttempts = 0
        
        // Trigger haptic feedback when starting to read a new data group
        // This indicates state change as the label changes on the modal
        if self.lastReadDataGroup != dgId {
            self.lastReadDataGroup = dgId
            self.triggerDataGroupReadHaptic()
        }
        
        self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.readingDataGroupProgress(dgId, 0) )

        repeat {
            do {
                let response = try await tagReader.readDataGroup(dataGroup:dgId)
                let dg = try DataGroupParser().parseDG(data: response)
                return dg
            } catch let error as PassportReaderError {
                Log.error( "TagError reading tag - \(error)" )
                
                // Stop haptic feedback on ANY read error - indicates communication issues
                self.stopHapticFeedback()

                // OK we had an error - depending on what happened, we may want to try to re-read this
                // E.g. we failed to read the last Datagroup because its protected and we can't
                let errMsg = error.value
                Log.error( "ERROR - \(errMsg)" )
                
                var redoBAC = false
                var isConnectionError = false
                
                if errMsg == "Session invalidated" || errMsg == "Tag connection lost"  {
                    // Severe connection error - tag was physically disconnected
                    // Throw TagConnectionLost to trigger restart polling at session level
                    Log.warning("Severe connection error detected (\(errMsg)) - throwing TagConnectionLost to trigger restart polling")
                    self.triggerErrorHaptic()
                    throw PassportReaderError.TagConnectionLost
                } else if errMsg == "Class not supported" {
                    isConnectionError = true
                    // Check if we have done Chip Authentication, if so, set it to nil and try to redo BAC
                    if self.caHandler != nil {
                        self.caHandler = nil
                        redoBAC = true
                    } else {
                        // Can't re-authenticate, throw connection lost to trigger restart
                        Log.warning("Class not supported and no CA handler - throwing TagConnectionLost")
                        self.triggerErrorHaptic()
                        throw PassportReaderError.TagConnectionLost
                    }
                } else if errMsg == "Security status not satisfied" || errMsg == "File not found" {
                    // Can't read this element as we aren't allowed - remove it and return out so we re-do BAC
                    self.dataGroupsToRead.removeFirst()
                    redoBAC = true
                } else if errMsg == "SM data objects incorrect" || errMsg == "Class not supported" {
                    // Can't read this element security objects now invalid - and return out so we re-do BAC
                    redoBAC = true
                } else if errMsg.hasPrefix( "Wrong length" ) || errMsg.hasPrefix( "End of file" ) {  // Should now handle errors 0x6C xx, and 0x67 0x00
                    // OK passport can't handle max length so drop it down
                    tagReader.reduceDataReadingAmount()
                } else if errMsg == "UnsupportedDataGroup" {
                    // OK, this DataGroup is not supported, lets skip it
                    Log.debug("Unsupported DataGroup - \(dgId.rawValue)")
                    return nil
                }
                
                // Trigger error haptic for connection errors
                if isConnectionError {
                    self.triggerErrorHaptic()
                }
                
                if redoBAC {
                    // Redo authentication (PACE first, then BAC fallback) and try again
                    try await doReauthentication(tagReader : tagReader)
                } else {
                    // Some other error lets have another try
                }
            } catch let error as NSError {
                // Handle NFC communication errors (e.g., NFCError Code 102 "Tag response error / no response")
                Log.error( "NFC Error reading tag - Domain: \(error.domain), Code: \(error.code), Description: \(error.localizedDescription)" )
                
                // Stop haptic feedback immediately on NFC communication errors
                self.stopHapticFeedback()
                self.triggerErrorHaptic()
                
                // NFCError code 102 is "Tag response error / no response"
                // This usually means the tag was physically moved away
                if error.domain == "NFCError" && error.code == 102 {
                    Log.warning("Tag response error (code 102) - connection likely lost, throwing TagConnectionLost to trigger restart polling")
                    throw PassportReaderError.TagConnectionLost
                } else {
                    // For other NFC errors, also treat as connection lost to allow restart
                    Log.warning("NFC error (\(error.domain) \(error.code)) - throwing TagConnectionLost to trigger restart polling")
                    throw PassportReaderError.TagConnectionLost
                }
            }
            readAttempts += 1
        } while ( readAttempts < 5 )
        
        return nil
    }

    func invalidateSession(errorMessage: NFCViewDisplayMessage, error: PassportReaderError) {
        // Stop haptic feedback
        self.stopHapticFeedback()
        
        // Mark the next 'invalid session' error as not reportable (we're about to cause it by invalidating the
        // session). The real error is reported back with the call to the completed handler
        self.shouldNotReportNextReaderSessionInvalidationErrorUserCanceled = true
        self.readerSession?.invalidate(errorMessage: self.nfcViewDisplayMessageHandler?(errorMessage) ?? errorMessage.description)
        nfcContinuation?.resume(throwing: error)
        nfcContinuation = nil
    }
}
#endif
