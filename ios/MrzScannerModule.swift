//
//  MrzScannerModule.swift
//

import Foundation
import React
import SwiftUI

@objc(MrzScannerModule)
class MrzScannerModule: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    return "MrzScannerModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func scan(_ options: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
        // Parse idType from options
        let idType = self.parseIDType(from: options)

        let mrzScanner = MRZScannerView(completionHandler: { result in
            // Handle the different scan results to match Android behavior
            switch result {
            case .success(let mrzData):
                // Successful scan - resolve with just the MRZ data string (like Android)
                resolve(mrzData)
            case .cancelled:
                // User cancelled - reject with "CANCELLED" error code (like Android)
                reject("CANCELLED", "MRZ scanning cancelled by user", nil)
            case .timeout:
                // Timeout - reject with "TIMEOUT" error code
                reject("TIMEOUT", "MRZ scan timeout - no code detected within 60 seconds", nil)
            }

            // Dismiss the scanner
            if let presentedVC = UIApplication.shared.keyWindow?.rootViewController?.presentedViewController {
                presentedVC.dismiss(animated: true, completion: nil)
            }
        }, idType: idType)

        let hostingController = UIHostingController(rootView: mrzScanner)
        hostingController.modalPresentationStyle = .fullScreen

        if let rootViewController = UIApplication.shared.keyWindow?.rootViewController {
            rootViewController.present(hostingController, animated: true)
        } else {
            reject("ERROR", "Unable to present MRZScanner", nil)
        }
    }
  }

  // Helper function to parse IDType from options
  private func parseIDType(from options: NSDictionary?) -> IDType {
    guard let options = options,
          let documentType = options["documentType"] as? String else {
      return .passport // Default to passport if not specified
    }

    // Map TypeScript DocumentType to Swift IDType
    switch documentType.lowercased() {
    case "passport":
      return .passport
    case "id_card", "id-card", "idcard":
      return .idCard
    case "residence_permit", "residence-permit", "residencepermit":
      return .residencePermit
    default:
      return .passport // Default to passport for unknown types
    }
  }
}
