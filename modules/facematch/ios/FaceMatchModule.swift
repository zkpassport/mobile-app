import ExpoModulesCore

public class FaceMatchModule: Module {
  // Helper function to resolve model paths
  private func resolveModelPath(_ provided: String) -> String? {
    if FileManager.default.fileExists(atPath: provided) {
      print("[FaceMatch] Using provided path: \(provided)")
      return provided
    }
    let filename = (provided as NSString).lastPathComponent
    let base = (filename as NSString).deletingPathExtension
    let ext = (filename as NSString).pathExtension
    if let path = Bundle.main.path(forResource: base, ofType: ext),
       FileManager.default.fileExists(atPath: path) {
      return path
    }
    if let path = Bundle(for: FaceMatchModule.self).path(forResource: base, ofType: ext),
       FileManager.default.fileExists(atPath: path) {
      return path
    }
    return nil
  }

  public func definition() -> ModuleDefinition {
    Name("FaceMatch")

    // Initialize both detection and recognition sessions
    AsyncFunction("initSessions") { (
      detectorPath: String,
      recognitionPath: String
    ) -> String in
      #if targetEnvironment(simulator)
      return "{\"success\":true}"
      #endif
      var json = ""

      let resolvedDetector = resolveModelPath(detectorPath) ?? detectorPath
      let resolvedRecognition = resolveModelPath(recognitionPath) ?? recognitionPath

      // Validate inputs before calling into Rust
      if !FileManager.default.fileExists(atPath: resolvedDetector) {
        let err = "{\"error\":\"detector_not_found\",\"path\":\"\(resolvedDetector)\"}"
        print("[FaceMatch] Error: \(err)")
        return err
      }
      if !FileManager.default.fileExists(atPath: resolvedRecognition) {
        let err = "{\"error\":\"recognition_not_found\",\"path\":\"\(resolvedRecognition)\"}"
        print("[FaceMatch] Error: \(err)")
        return err
      }

      resolvedDetector.withCString { detectorC in
        resolvedRecognition.withCString { recognitionC in
          let ptr = facematch_init_sessions(detectorC, recognitionC)
          if let ptr = ptr {
            defer { rust_string_free(ptr) }
            json = String(cString: ptr)
            print("[FaceMatch] facematch_init_sessions() returned \(json)")
          } else {
            print("[FaceMatch] Error: facematch_init_sessions() returned null")
            json = "{\"error\":\"init_failed\"}"
          }
        }
      }
      return json
    }

    // Cleanup sessions and free memory
    AsyncFunction("cleanupSessions") { () -> String in
      #if targetEnvironment(simulator)
      print("[FaceMatch] Running on Simulator — returning success")
      return "{\"success\":true}"
      #endif
      var json = ""
      let ptr = facematch_cleanup_sessions()
      if let ptr = ptr {
        defer { rust_string_free(ptr) }
        json = String(cString: ptr)
        print("[FaceMatch] facematch_cleanup_sessions() returned \(json)")
      } else {
        print("[FaceMatch] Error: facematch_cleanup_sessions() returned null")
        json = "{\"error\":\"cleanup_failed\"}"
      }
      return json
    }

    // Analyze face detection only - returns landmarks, pose, gaze
    AsyncFunction("analyzeFaceDetection") { (
      bytes: [UInt8],
      scrfdModelPath: String
    ) -> String in
      #if targetEnvironment(simulator)
      return "{}"
      #endif
      var json = ""

      let resolvedScrfd = resolveModelPath(scrfdModelPath) ?? scrfdModelPath
      print("[FaceMatch] Resolved scrfd='\(resolvedScrfd)'")

      // Validate inputs before calling into Rust
      if bytes.isEmpty {
        let err = "{\"error\":\"empty_image_bytes\"}"
        print("[FaceMatch] Error: \(err)")
        return err
      }
      if !FileManager.default.fileExists(atPath: resolvedScrfd) {
        let err = "{\"error\":\"scrfd_not_found\",\"path\":\"\(resolvedScrfd)\"}"
        print("[FaceMatch] Error: \(err)")
        return err
      }

      bytes.withUnsafeBufferPointer { buf in
        guard let base = buf.baseAddress else {
          print("[FaceMatch] Error: baseAddress nil")
          json = ""
          return
        }
        resolvedScrfd.withCString { scrfdC in
          let ptr = analyze_face_detection(base, UInt(buf.count), scrfdC)
          if let ptr = ptr {
            defer { rust_string_free(ptr) }
            json = String(cString: ptr)
            print("[FaceMatch] analyze_face_detection() returned \(json.prefix(200))")
          } else {
            print("[FaceMatch] Error: analyze_face_detection() returned null")
            json = ""
          }
        }
      }
      return json
    }

    // Generate face embedding only - requires pre-detected landmarks
    AsyncFunction("analyzeFaceEmbedding") { (
      bytes: [UInt8],
      arcfaceModelPath: String,
      landmarksJson: String
    ) -> String in
      #if targetEnvironment(simulator)
      print("[FaceMatch] Running on Simulator — returning {}")
      return "{}"
      #endif
      var json = ""
      print("[FaceMatch] analyzeFaceEmbedding: bytes=\(bytes.count) arc='\(arcfaceModelPath)'")

      let resolvedArc = resolveModelPath(arcfaceModelPath) ?? arcfaceModelPath
      print("[FaceMatch] Resolved arc='\(resolvedArc)'")

      // Validate inputs before calling into Rust
      if bytes.isEmpty {
        let err = "{\"error\":\"empty_image_bytes\"}"
        print("[FaceMatch] Error: \(err)")
        return err
      }
      if !FileManager.default.fileExists(atPath: resolvedArc) {
        let err = "{\"error\":\"arcface_not_found\",\"path\":\"\(resolvedArc)\"}"
        print("[FaceMatch] Error: \(err)")
        return err
      }

      bytes.withUnsafeBufferPointer { buf in
        guard let base = buf.baseAddress else {
          print("[FaceMatch] Error: baseAddress nil")
          json = ""
          return
        }
        resolvedArc.withCString { arcfaceC in
          landmarksJson.withCString { landmarksC in
            print("[FaceMatch] Calling analyze_face_embedding()")
            let ptr = analyze_face_embedding(base, UInt(buf.count), arcfaceC, landmarksC)
            if let ptr = ptr {
              defer { rust_string_free(ptr) }
              json = String(cString: ptr)
              print("[FaceMatch] analyze_face_embedding() returned \(json.prefix(200))")
            } else {
              print("[FaceMatch] Error: analyze_face_embedding() returned null")
              json = ""
            }
          }
        }
      }
      return json
    }
  }
}