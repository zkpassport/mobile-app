import ExpoModulesCore
import DeviceCheck

private func err(_ message: String, code: Int = 1) -> NSError {
  NSError(domain: "AppAttest", code: code, userInfo: [NSLocalizedDescriptionKey: message])
}

public class AppAttestModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppAttestModule")

    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 14.0, *) {
        return DCAppAttestService.shared.isSupported
      } else { return false }
    }

    AsyncFunction("generateKey") { () -> String in
      try await withCheckedThrowingContinuation { cont in
        guard #available(iOS 14.0, *) else {
          cont.resume(throwing: err("App Attest requires iOS 14+")); return
        }
        DCAppAttestService.shared.generateKey { keyId, error in
          if let error = error { cont.resume(throwing: error); return }
          guard let keyId = keyId else {
            cont.resume(throwing: err("Failed to generate keyId")); return
          }
          cont.resume(returning: keyId)
        }
      }
    }

    AsyncFunction("attestKey") { (keyId: String, clientDataHashB64: String) -> String in
      try await withCheckedThrowingContinuation { cont in
        guard #available(iOS 14.0, *) else {
          cont.resume(throwing: err("App Attest requires iOS 14+")); return
        }
        guard let clientDataHash = Data(base64Encoded: clientDataHashB64) else {
          cont.resume(throwing: err("clientDataHash must be base64")); return
        }

        var didResume = false
        func safeResolve(_ result: Result<String, Error>) {
          if didResume { return }
          didResume = true
          switch result {
          case .success(let value):
            cont.resume(returning: value)
          case .failure(let error):
            cont.resume(throwing: error)
          }
        }

        let deadline = DispatchTime.now() + .seconds(30)
        DispatchQueue.global().asyncAfter(deadline: deadline) {
          safeResolve(.failure(err("attestKey timed out")))
        }

        DCAppAttestService.shared.attestKey(keyId, clientDataHash: clientDataHash) { attObj, error in
          if let error = error { safeResolve(.failure(error)); return }
          guard let attObj = attObj else {
            safeResolve(.failure(err("No attestation object"))); return
          }
          safeResolve(.success(attObj.base64EncodedString()))
        }
      }
    }

    AsyncFunction("generateAssertion") { (keyId: String, clientDataHashB64: String) -> String in
      try await withCheckedThrowingContinuation { cont in
        guard #available(iOS 14.0, *) else {
          cont.resume(throwing: err("App Attest requires iOS 14+")); return
        }
        guard let clientDataHash = Data(base64Encoded: clientDataHashB64) else {
          cont.resume(throwing: err("clientDataHash must be base64")); return
        }
        DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
          if let error = error { cont.resume(throwing: error); return }
          guard let assertion = assertion else {
            cont.resume(throwing: err("No assertion")); return
          }
          cont.resume(returning: assertion.base64EncodedString())
        }
      }
    }
  }
}
