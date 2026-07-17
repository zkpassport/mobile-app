//
//  PassportReaderModule.swift
//  ProofOfPassport
//
//  Created by Theo Madzou on 02/02/2024.
//

import Foundation
import React
import PassportReader
import Security
import CoreNFC

@available(iOS 13, macOS 10.15, *)
extension CertificateType {
    func stringValue() -> String {
        switch self {
            case .documentSigningCertificate:
                return "documentSigningCertificate"
            case .issuerSigningCertificate:
                return "issuerSigningCertificate"
        }
    }
}

// Helper function to map the keys of a dictionary
extension Dictionary {
    func mapKeys<T: Hashable>(_ transform: (Key) -> T) -> Dictionary<T, Value> {
        Dictionary<T, Value>(uniqueKeysWithValues: map { (transform($0.key), $0.value) })
    }
}

// Add this enum before the PassportReaderModule class
enum PassportValue: Encodable {
    case string(String)
    case bytes([UInt8])

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let str):
            try container.encode(str)
        case .bytes(let bytes):
            try container.encode(bytes)
        }
    }
}

@available(iOS 15, *)
@objc(PassportReaderModule)
class PassportReaderModule: NSObject{

  private let passportReader = PassportReader()

  func getMRZKey(passportNumber: String, dateOfBirth: String, dateOfExpiry: String ) -> String {

    // Pad fields if necessary
    let pptNr = pad( passportNumber, fieldLength:9)
    let dob = pad( dateOfBirth, fieldLength:6)
    let exp = pad( dateOfExpiry, fieldLength:6)

    // Calculate checksums
    let passportNrChksum = calcCheckSum(pptNr)
    let dateOfBirthChksum = calcCheckSum(dob)
    let expiryDateChksum = calcCheckSum(exp)

    let mrzKey = "\(pptNr)\(passportNrChksum)\(dob)\(dateOfBirthChksum)\(exp)\(expiryDateChksum)"

    return mrzKey
  }

  func pad( _ value : String, fieldLength:Int ) -> String {
    // Pad out field lengths with < if they are too short
    let paddedValue = value.count < fieldLength ? (value + String(repeating: "<", count: fieldLength - value.count)) : value
    return String(paddedValue)
  }

  func calcCheckSum( _ checkString : String ) -> Int {
    let characterDict  = ["0" : "0", "1" : "1", "2" : "2", "3" : "3", "4" : "4", "5" : "5", "6" : "6", "7" : "7", "8" : "8", "9" : "9", "<" : "0", " " : "0", "A" : "10", "B" : "11", "C" : "12", "D" : "13", "E" : "14", "F" : "15", "G" : "16", "H" : "17", "I" : "18", "J" : "19", "K" : "20", "L" : "21", "M" : "22", "N" : "23", "O" : "24", "P" : "25", "Q" : "26", "R" : "27", "S" : "28","T" : "29", "U" : "30", "V" : "31", "W" : "32", "X" : "33", "Y" : "34", "Z" : "35"]

    var sum = 0
    var m = 0
    let multipliers : [Int] = [7, 3, 1]
    for c in checkString {
      guard let lookup = characterDict["\(c)"],
            let number = Int(lookup) else { return 0 }
      let product = number * multipliers[m]
      sum += product
      m = (m+1) % 3
    }
    return (sum % 10)
  }

  @objc(scan:dateOfBirth:dateOfExpiry:isPacePolling:resolve:reject:)
  func scan(_ passportNumber: String, dateOfBirth: String, dateOfExpiry: String, isPacePolling: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {

    Task { @MainActor in
      do {
        // Validate NFC availability before attempting scan
        guard NFCReaderSession.readingAvailable else {
          reject("E_NFC_NOT_SUPPORTED", "NFC reading not supported on this device", nil)
          return
        }

        let mrzKey = getMRZKey( passportNumber: passportNumber, dateOfBirth: dateOfBirth, dateOfExpiry: dateOfExpiry)

        // Limit the data groups to read to the minimum required for the app to work
        let passport = try await passportReader.readPassport(mrzKey: mrzKey, tags: [DataGroupId.SOD, DataGroupId.COM, DataGroupId.DG1, DataGroupId.DG2, DataGroupId.DG11, DataGroupId.DG12], isPacePolling: isPacePolling)

        var ret = [String: PassportValue]()
        print("documentType", passport.documentType)

        // Convert all values to PassportValue
        ret["documentType"] = .string(passport.documentType)
        ret["documentSubType"] = .string(passport.documentSubType)
        ret["documentNumber"] = .string(passport.documentNumber)
        ret["issuingAuthority"] = .string(passport.issuingAuthority)
        ret["documentExpiryDate"] = .string(passport.documentExpiryDate)
        ret["dateOfIssue"] = .string(passport.dateOfIssue ?? "")
        ret["dateOfBirth"] = .string(passport.dateOfBirth)
        ret["gender"] = .string(passport.gender)
        ret["nationality"] = .string(passport.nationality)
        ret["lastName"] = .string(passport.lastName)
        // Only take the first of the given names
        ret["firstName"] = .string(passport.firstName.components(separatedBy: " ")[0])
        ret["fullname"] = .string(passport.getFullName())
        ret["mrz"] = .string(passport.passportMRZ)
        ret["placeOfBirth"] = .string(passport.placeOfBirth ?? "")
        ret["residenceAddress"] = .string(passport.residenceAddress ?? "")
        ret["phoneNumber"] = .string(passport.phoneNumber ?? "")
        ret["personalNumber"] = .string(passport.personalNumber ?? "")
        ret["photo"] = .string("data:image/jpeg;base64," + (passport.passportImage?.pngData()?.base64EncodedString() ?? ""))
        // TODO: Do we still need this twice now that we're removing the photo background elsewhere?
        ret["originalPhoto"] = .string("data:image/jpeg;base64," + (passport.passportImage?.pngData()?.base64EncodedString() ?? ""))
        ret["photoWidth"] = .string(passport.passportImage?.size.width.description ?? "")
        ret["photoHeight"] = .string(passport.passportImage?.size.height.description ?? "")
        ret["LDSVersion"] = .string(passport.LDSVersion)
        ret["dataGroupsPresent"] = .string(passport.dataGroupsPresent.joined(separator: ", "))

        do {
          let dataGroupHashesDict = passport.dataGroupHashes.mapKeys { "\($0)" }
          let dataGroupValuesDict = passport.dataGroupsRead.mapKeys { "\($0)" }
          let serializableDataGroupHashes = dataGroupHashesDict.mapValues { [UInt8]($0.sodHash.hexadecimal!) }
          let serializableDataGroupValues = dataGroupValuesDict.mapValues { [UInt8]($0.data) }
          let dataGroupHashesData = try JSONSerialization.data(withJSONObject: serializableDataGroupHashes, options: [])
          let dataGroupValuesData = try JSONSerialization.data(withJSONObject: serializableDataGroupValues, options: [])
          let dataGroupHashesJsonString = String(data: dataGroupHashesData, encoding: .utf8) ?? ""
          let dataGroupValuesJsonString = String(data: dataGroupValuesData, encoding: .utf8) ?? ""
          ret["dataGroupHashes"] = .string(dataGroupHashesJsonString)
          ret["dataGroupValues"] = .string(dataGroupValuesJsonString)
        } catch {
            print("Error serializing dataGroupHashes: \(error)")
        }

        let sod = passport.getDataGroup(DataGroupId.SOD) as! SOD

        ret["sod"] = .bytes(sod.body)
        let stringified = String(data: try JSONEncoder().encode(ret), encoding: .utf8)

        resolve(stringified)
      } catch {
        // Handle PassportReaderError types first
        if let passportError = error as? PassportReaderError {
          // Check for NFC system failure by examining the error description
          let errorDesc = passportError.localizedDescription

          if errorDesc.contains("NFC system failure") || errorDesc.contains("device restart required") {
            // Critical: NFC system failure - device restart required
            reject("E_NFC_SYSTEM_FAILURE", errorDesc, error)
          } else {
            switch passportError {
            case .UserCanceled:
              reject("E_USER_CANCELED", "User canceled NFC session", error)
            case .NFCNotSupported:
              reject("E_NFC_NOT_SUPPORTED", "NFC reading not supported on this device", error)
            case .InvalidMRZKey:
              reject("E_INVALID_MRZ", "Invalid MRZ key - please check passport details", error)
            case .ConnectionError:
              reject("E_CONNECTION_ERROR", "NFC connection error - try again", error)
            case .TagNotValid:
              reject("E_TAG_NOT_VALID", "Invalid NFC tag detected", error)
            case .MoreThanOneTagFound:
              reject("E_MULTIPLE_TAGS", "Multiple NFC tags detected", error)
            default:
              reject("E_PASSPORT_READ", errorDesc, error)
            }
          }
        } else if let nfcError = error as NSError? {
          // Handle raw NFC errors
          switch nfcError.code {
          case 200: // NFCReaderSessionInvalidationErrorUserCanceled
            reject("E_USER_CANCELED", "User canceled NFC session", error)
          case 201: // NFCReaderSessionInvalidationErrorSessionTimeout
            reject("E_SESSION_TIMEOUT", "NFC session timed out", error)
          case 203: // NFCReaderSessionInvalidationErrorSystemIsBusy
            // This is also a potential system failure indicator
            reject("E_NFC_SYSTEM_FAILURE", "NFC system is busy - this may indicate a system-level failure. Please restart your device and try again.", error)
          default:
            // Check for other system failure indicators
            let errorDesc = nfcError.localizedDescription.lowercased()
            if errorDesc.contains("system") || errorDesc.contains("unavailable") || errorDesc.contains("internal") {
              reject("E_NFC_SYSTEM_FAILURE", "NFC system error - device restart may be required. \(nfcError.localizedDescription)", error)
            } else {
              reject("E_PASSPORT_READ", error.localizedDescription, error)
            }
          }
        } else {
          reject("E_PASSPORT_READ", error.localizedDescription, error)
        }
      }
    }
  }

func serializePublicKey(_ publicKey: SecKey) -> String? {
    var error: Unmanaged<CFError>?
    guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
        print("Error serializing public key: \(error!.takeRetainedValue() as Error)")
        return nil
    }
    return publicKeyData.base64EncodedString()
}

  func serializeSignature(from sod: SOD) -> String? {
    do {
      let signature = try sod.getSignature()
      return signature.base64EncodedString()
    } catch {
      print("Error extracting signature: \(error)")
      return nil
    }
  }

  func serializeX509Wrapper(_ certificate: X509Wrapper?) -> String? {
    guard let certificate = certificate else { return nil }

    let itemsDict = certificate.getItemsAsDict()
    var certInfoStringKeys = [String: String]()

    // Convert CertificateItem keys to String keys
    for (key, value) in itemsDict {
      certInfoStringKeys[key.rawValue] = value
    }

    // Add PEM representation
    let certPEM = certificate.certToPEM()
    certInfoStringKeys["PEM"] = certPEM

    do {
      let jsonData = try JSONSerialization.data(withJSONObject: certInfoStringKeys, options: [])
      return String(data: jsonData, encoding: .utf8)
    } catch {
      print("Error serializing X509Wrapper: \(error)")
      return nil
    }
  }

  func encodeX509WrapperToJsonString(_ certificate: X509Wrapper?) -> String? {
    guard let certificate = certificate else { return nil }
    let certificateItems = certificate.getItemsAsDict()

    // Convert certificate items to JSON
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: certificateItems, options: [])
      return String(data: jsonData, encoding: .utf8)
    } catch {
      print("Error serializing certificate items to JSON: \(error)")
      return nil
    }
  }

  func encodeByteArrayToHexString(_ byteArray: [UInt8]) -> String {
    return byteArray.map { String(format: "%02x", $0) }.joined()
  }

  func encodeErrors(_ errors: [Error]) -> [String] {
    return errors.map { $0.localizedDescription }
  }

  func convertDataGroupHashToSerializableFormat(_ dataGroupHash: DataGroupHash) -> [String: Any] {
    return [
      "id": dataGroupHash.id,
      "sodHash": dataGroupHash.sodHash
    ]
  }

  func dataGroupIdToString(_ id: DataGroupId) -> String {
    return String(id.rawValue) // or any other method to get a string representation
  }

  func certificateTypeToString(_ type: CertificateType) -> String {
      return type.stringValue()
  }

  func convertDataGroupToSerializableFormat(_ dataGroup: DataGroup) -> [String: Any] {
    return [
      "datagroupType": dataGroupIdToString(dataGroup.datagroupType),
      "body": encodeByteArrayToHexString(dataGroup.body),
      "data": encodeByteArrayToHexString(dataGroup.data)
    ]
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
}

