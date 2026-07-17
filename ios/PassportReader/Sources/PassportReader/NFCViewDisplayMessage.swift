import Foundation

@available(iOS 13, macOS 10.15, *)
public enum NFCViewDisplayMessage {
    case requestPresentPassport
    case requestPresentPassportAgain
    case authenticatingWithPassport(Int)
    case readingDataGroupProgress(DataGroupId, Int)
    case error(PassportReaderError)
    case successfulRead
    /// Connection was lost - prompting user to keep device still and reposition
    case connectionLost
    /// Retrying connection after loss
    case retryingConnection(Int, Int) // (currentAttempt, maxAttempts)
    /// Tag was successfully reconnected after connection loss
    case tagReconnected
}

extension String {
    func localized(withComment: String) -> String {
        return NSLocalizedString(self, tableName: nil, bundle: Bundle.module, value: "", comment: withComment)
    }
}


// TODO: Update this

@available(iOS 13, macOS 10.15, *)
extension NFCViewDisplayMessage {


    func humanReadableDataGroupName(for dataGroup: String) -> String {
        let dataGroupNames: [String: String] = [
            "COM": "Reading Common Data...".localized(withComment: "Common Data"),
            "DG1": "Reading MRZ...".localized(withComment: "MRZ"),
            "DG2": "Reading Photo...".localized(withComment: "Photo"),
            "DG3": "Reading Fingerprint...".localized(withComment: "Fingerprint"),
            "DG4": "Reading Iris...".localized(withComment: "Iris"),
            "DG5": "Reading Portrait...".localized(withComment: "Portrait"),
//            "DG6": "Reserved for future use",
            "DG7": "Reading Signature...".localized(withComment: "Signature"),
//            "DG8": "Data features",
//            "DG9": "Structure features",
//            "DG10": "Additions to CA",
//            "DG11": "Additions to AA",
//            "DG12": "Reserved for future use",
//            "DG13": "Reserved for future use",
            "DG14": "Reading Security options...".localized(withComment: "Security options"),
            "DG15": "Reading Public key...".localized(withComment: "Public key"),
            "DG16": "Reading Persons to notify...".localized(withComment: "Persons to notify"),
            "SOD": "Reading Security Data...".localized(withComment: "Security Data")
        ]

        return dataGroupNames[dataGroup] ?? dataGroup
    }

    public var description: String {
        switch self {
            case .requestPresentPassport:
            return "Move your phone slowly against your ID".localized(withComment: "Hold phone against ID")
            case .requestPresentPassportAgain:
                return "There was an issue reading the ID. Please try again.".localized(withComment: "Try again")
            case .authenticatingWithPassport(let progress):
//                let progressString = handleProgressDots(percentualProgress: progress)
                return "Verifying...".localized(withComment: "Verifying")
            case .readingDataGroupProgress(let dataGroup, let progress):
                let dataGroupName = humanReadableDataGroupName(for: dataGroup.getName())
                let progressString = handleProgressDots(percentualProgress: progress)
                return "\(dataGroupName)\(progressString)"
            case .error(let tagError):
                switch tagError {
                    case PassportReaderError.TagNotValid:
                        return "Tag not valid.".localized(withComment: "Invalid tag")
                    case PassportReaderError.MoreThanOneTagFound:
                        return "More than 1 tags was found. Please present only 1 tag.".localized(withComment: "Multiple tags")
                    case PassportReaderError.ConnectionError:
                        return "Connection error. Please try again.".localized(withComment: "Connection error")
                    case PassportReaderError.InvalidMRZKey:
                        return "MRZ Key not valid for this document.".localized(withComment: "Invalid MRZ")
                    case PassportReaderError.ResponseError(let description, let sw1, let sw2):
                        if sw1 == 0x6A && sw2 == 0x82 {
                            return "Stay still, the modal will show again in 5s".localized(withComment: "Stay still")
                        } else {
                            return "Error: \(description) - (0x\(sw1), 0x\(sw2))".localized(withComment: "Error with details")
                        }
                    default:
                        return "Sorry, there was a problem reading the ID. Please try again".localized(withComment: "Generic error")
                }
            case .successfulRead:
                return "ID scanned successfully".localized(withComment: "Success")
            case .connectionLost:
                return "Connection lost. Keep your device still and close to the ID.".localized(withComment: "Connection lost")
            case .retryingConnection(let attempt, let maxAttempts):
                return "Reconnecting... (\(attempt)/\(maxAttempts))".localized(withComment: "Retrying connection")
            case .tagReconnected:
                return "Reconnected! Continuing scan...".localized(withComment: "Tag reconnected")
        }
    }
    
    func handleProgressDots(percentualProgress: Int) -> String {
        let p = (percentualProgress/20)
        let dots = String(repeating: ".", count: p)
        return "\(dots)"
    }

    func handleProgress(percentualProgress: Int) -> String {
        let p = (percentualProgress/20)
        let full = String(repeating: "🟢 ", count: p)
        let empty = String(repeating: "⚪️ ", count: 5-p)
        return "\(full)\(empty)"
    }
}
