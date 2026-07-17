import ExpoModulesCore
import UIKit

public class Dg2CropModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Dg2Crop")

    // Trim white border from a base64-encoded image
    AsyncFunction("trimWhiteBorderBase64") { (
      base64Input: String,
      tolerance: Int
    ) -> String in
      var json = ""

      base64Input.withCString { base64C in
        let ptr = trim_dg2_base64(base64C, UInt8(tolerance))
        if let ptr = ptr {
          defer { rust_string_free(ptr) }
          json = String(cString: ptr)
        } else {
          json = "{\"error\":\"trim_failed\"}"
        }
      }

      return json
    }

    // Remove background from a base64-encoded image (iOS only)
    AsyncFunction("removeBackgroundBase64") { (
      base64Input: String
    ) -> String in
      // Decode base64 to image
      guard let imageData = Data(base64Encoded: base64Input),
            let image = UIImage(data: imageData) else {
        return "{\"error\":\"invalid_base64_or_image\"}"
      }

      // Remove background
      guard let processedImage = image.removeBackground(returnResult: .finalImage) else {
        return "{\"error\":\"background_removal_failed\"}"
      }

      // Convert back to PNG base64
      guard let pngData = processedImage.pngData() else {
        return "{\"error\":\"png_encoding_failed\"}"
      }

      let base64Output = pngData.base64EncodedString()
      return "{\"result\":\"\(base64Output)\"}"
    }
  }
}
