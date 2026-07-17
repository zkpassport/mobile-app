import Foundation

// MARK: TagError
@available(iOS 13, macOS 10.15, *)
public enum PassportReaderError: Error {
    case ResponseError(String, UInt8, UInt8)
    case InvalidResponse
    case UnexpectedError
    case NFCNotSupported
    case NoConnectedTag
    case D087Malformed
    case InvalidResponseChecksum
    case MissingMandatoryFields
    case CannotDecodeASN1Length
    case InvalidASN1Value
    case UnableToProtectAPDU
    case UnableToUnprotectAPDU
    case UnsupportedDataGroup
    case DataGroupNotRead
    case UnknownTag
    case UnknownImageFormat
    case InvalidJPEGFormat
    case NotImplemented
    case TagNotValid
    case ConnectionError
    case UserCanceled
    case InvalidMRZKey
    case MoreThanOneTagFound
    case InvalidHashAlgorithmSpecified
    case UnsupportedCipherAlgorithm
    case UnsupportedMappingType
    case PACEError(String,String)
    case ChipAuthenticationFailed
    case InvalidDataPassed(String)
    case NotYetSupported(String)
    case UnableToExtractPubKeyFromSOD
    case UnableToExtractPubKeyFromDG15
    /// NFC system-level failure - the NFC subsystem is in a corrupted state and requires a device restart
    case NFCSystemFailure(String)
    /// WiFi interference detected - multiple connection failures that may be caused by WiFi RF interference
    case WiFiInterference
    /// Tag connection was lost and requires restart polling to reconnect
    /// This is a recoverable error that should trigger session.restartPolling()
    case TagConnectionLost


    public var value: String {
        switch self {
            case .ResponseError(let errMsg, _, _): return errMsg
            case .InvalidResponse: return "InvalidResponse"
            case .UnexpectedError: return "UnexpectedError"
            case .NFCNotSupported: return "NFCNotSupported"
            case .NoConnectedTag: return "NoConnectedTag"
            case .D087Malformed: return "D087Malformed"
            case .InvalidResponseChecksum: return "InvalidResponseChecksum"
            case .MissingMandatoryFields: return "MissingMandatoryFields"
            case .CannotDecodeASN1Length: return "CannotDecodeASN1Length"
            case .InvalidASN1Value: return "InvalidASN1Value"
            case .UnableToProtectAPDU: return "UnableToProtectAPDU"
            case .UnableToUnprotectAPDU: return "UnableToUnprotectAPDU"
            case .UnsupportedDataGroup: return "UnsupportedDataGroup"
            case .DataGroupNotRead: return "DataGroupNotRead"
            case .UnknownTag: return "UnknownTag"
            case .UnknownImageFormat: return "UnknownImageFormat"
            case .InvalidJPEGFormat: return "InvalidJPEGFormat"
            case .NotImplemented: return "NotImplemented"
            case .TagNotValid: return "TagNotValid"
            case .ConnectionError: return "ConnectionError"
            case .UserCanceled: return "UserCanceled"
            case .InvalidMRZKey: return "InvalidMRZKey"
            case .MoreThanOneTagFound: return "MoreThanOneTagFound"
            case .InvalidHashAlgorithmSpecified: return "InvalidHashAlgorithmSpecified"
            case .UnsupportedCipherAlgorithm: return "UnsupportedCipherAlgorithm"
            case .UnsupportedMappingType: return "UnsupportedMappingType"
            case .PACEError(let step, let reason): return "PACEError (\(step)) - \(reason)"
            case .ChipAuthenticationFailed: return "ChipAuthenticationFailed"
            case .InvalidDataPassed(let reason) : return "Invalid data passed - \(reason)"
            case .NotYetSupported(let reason) : return "Not yet supported - \(reason)"
            case .UnableToExtractPubKeyFromSOD: return "UnableToExtractPubKeyFromSOD"
            case .UnableToExtractPubKeyFromDG15: return "UnableToExtractPubKeyFromDG15"
            case .NFCSystemFailure(let reason): return "NFCSystemFailure - \(reason)"
            case .WiFiInterference: return "WiFiInterference"
            case .TagConnectionLost: return "TagConnectionLost"
        }
    }
}

@available(iOS 13, macOS 10.15, *)
extension PassportReaderError: LocalizedError {
    public var errorDescription: String? {
        switch self {
            case .ResponseError(let errMsg, _, _): return errMsg.localized(withComment: "Response error")
            case .InvalidResponse: return "Invalid response".localized(withComment: "Invalid response")
            case .UnexpectedError: return "Unexpected error".localized(withComment: "Unexpected error")
            case .NFCNotSupported: return "NFC not supported".localized(withComment: "NFC not supported")
            case .NoConnectedTag: return "No connected tag".localized(withComment: "No connected tag")
            case .D087Malformed: return "D087 malformed".localized(withComment: "D087 malformed")
            case .InvalidResponseChecksum: return "Invalid response checksum".localized(withComment: "Invalid checksum")
            case .MissingMandatoryFields: return "Missing mandatory fields".localized(withComment: "Missing fields")
            case .CannotDecodeASN1Length: return "Cannot decode ASN1 length".localized(withComment: "ASN1 length")
            case .InvalidASN1Value: return "Invalid ASN1 value".localized(withComment: "Invalid ASN1")
            case .UnableToProtectAPDU: return "Unable to protect APDU".localized(withComment: "APDU protection")
            case .UnableToUnprotectAPDU: return "Unable to unprotect APDU".localized(withComment: "APDU unprotection")
            case .UnsupportedDataGroup: return "Unsupported data group".localized(withComment: "Unsupported DG")
            case .DataGroupNotRead: return "Data group not read".localized(withComment: "DG not read")
            case .UnknownTag: return "Unknown tag".localized(withComment: "Unknown tag")
            case .UnknownImageFormat: return "Unknown image format".localized(withComment: "Unknown format")
            case .InvalidJPEGFormat: return "Invalid JPEG format - missing end marker".localized(withComment: "Invalid JPEG")
            case .NotImplemented: return "Not implemented".localized(withComment: "Not implemented")
            case .TagNotValid: return "Tag not valid".localized(withComment: "Invalid tag")
            case .ConnectionError: return "Connection error".localized(withComment: "Connection error")
            case .UserCanceled: return "User canceled".localized(withComment: "User canceled")
            case .InvalidMRZKey: return "Invalid MRZ key".localized(withComment: "Invalid MRZ")
            case .MoreThanOneTagFound: return "More than one tag found".localized(withComment: "Multiple tags")
            case .InvalidHashAlgorithmSpecified: return "Invalid hash algorithm specified".localized(withComment: "Invalid hash")
            case .UnsupportedCipherAlgorithm: return "Unsupported cipher algorithm".localized(withComment: "Unsupported cipher")
            case .UnsupportedMappingType: return "Unsupported mapping type".localized(withComment: "Unsupported mapping")
            case .PACEError(let step, let reason): return "PACE error (\(step)) - \(reason)".localized(withComment: "PACE error")
            case .ChipAuthenticationFailed: return "Chip authentication failed".localized(withComment: "Chip auth failed")
            case .InvalidDataPassed(let reason): return "Invalid data passed - \(reason)".localized(withComment: "Invalid data")
            case .NotYetSupported(let reason): return "Not yet supported - \(reason)".localized(withComment: "Not supported")
            case .UnableToExtractPubKeyFromSOD: return "Unable to extract public key from SOD".localized(withComment: "SOD key extraction")
            case .UnableToExtractPubKeyFromDG15: return "Unable to extract public key from DG15".localized(withComment: "DG15 key extraction")
            case .NFCSystemFailure(let reason): return "NFC system failure - device restart required. \(reason)".localized(withComment: "NFC system failure")
            case .WiFiInterference: return "WiFi interference detected - try turning off WiFi and retry".localized(withComment: "WiFi interference")
            case .TagConnectionLost: return "Tag connection lost - keep device close to the ID".localized(withComment: "Tag connection lost")
        }
    }
}


// MARK: OpenSSLError
@available(iOS 13, macOS 10.15, *)
public enum OpenSSLError: Error {
    case UnableToGetX509CertificateFromPKCS7(String)
    case UnableToVerifyX509CertificateForSOD(String)
    case VerifyAndReturnSODEncapsulatedData(String)
    case UnableToReadECPublicKey(String)
    case UnableToExtractSignedDataFromPKCS7(String)
    case VerifySignedAttributes(String)
    case UnableToParseASN1(String)
    case UnableToDecryptRSASignature(String)
}

@available(iOS 13, macOS 10.15, *)
extension OpenSSLError: LocalizedError {
    public var errorDescription: String? {
        switch self {
            case .UnableToGetX509CertificateFromPKCS7(let reason):
                return "Unable to read the SOD PKCS7 Certificate. \(reason)".localized(withComment: "PKCS7 cert")
            case .UnableToVerifyX509CertificateForSOD(let reason):
                return "Unable to verify the SOD X509 certificate. \(reason)".localized(withComment: "X509 cert")
            case .VerifyAndReturnSODEncapsulatedData(let reason):
                return "Unable to verify the SOD Datagroup hashes. \(reason)".localized(withComment: "SOD hashes")
            case .UnableToReadECPublicKey(let reason):
                return "Unable to read ECDSA Public key \(reason)!".localized(withComment: "ECDSA key")
            case .UnableToExtractSignedDataFromPKCS7(let reason):
                return "Unable to extract Signer data from PKCS7 \(reason)!".localized(withComment: "PKCS7 data")
            case .VerifySignedAttributes(let reason):
                return "Unable to Verify the SOD SignedAttributes \(reason)!".localized(withComment: "SOD attributes")
            case .UnableToParseASN1(let reason):
                return "Unable to parse ASN1 \(reason)!".localized(withComment: "ASN1 parsing")
            case .UnableToDecryptRSASignature(let reason):
                return "Unable to decrypt RSA Signature \(reason)!".localized(withComment: "RSA signature")
        }
    }
}


// MARK: PassiveAuthenticationError
public enum PassiveAuthenticationError: Error {
    case UnableToParseSODHashes(String)
    case InvalidDataGroupHash(String)
    case SODMissing(String)
}


extension PassiveAuthenticationError: LocalizedError {
    public var errorDescription: String? {
        switch self {
            case .UnableToParseSODHashes(let reason):
                return "Unable to parse the SOD Datagroup hashes. \(reason)".localized(withComment: "SOD hashes")
            case .InvalidDataGroupHash(let reason):
                return "DataGroup hash not present or didn't match \(reason)!".localized(withComment: "DG hash")
            case .SODMissing(let reason):
                return "DataGroup SOD not present or not read \(reason)!".localized(withComment: "SOD missing")
                
        }
    }
}
