import UIKit
import Vision

enum RemoveBackgroundResult {
    case finalImage
    case mask
    case background
}

extension UIImage {
    /// Remove background using Vision's person segmentation
    /// Returns the image with background removed (person only with transparent background)
    func removeBackground(returnResult: RemoveBackgroundResult = .finalImage) -> UIImage? {
        guard let inputImage = CIImage(image: self) else {
            print("[BackgroundRemoval] Failed to create CIImage")
            return nil
        }

        let request = VNGeneratePersonSegmentationRequest()
        request.qualityLevel = .accurate
        request.revision = VNGeneratePersonSegmentationRequestRevision1

        let handler = VNImageRequestHandler(ciImage: inputImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            print("[BackgroundRemoval] Failed to perform segmentation: \(error)")
            return nil
        }

        guard let result = request.results?.first else {
            print("[BackgroundRemoval] No segmentation results")
            return nil
        }

        let maskPixelBuffer = result.pixelBuffer
        let maskImage = CIImage(cvPixelBuffer: maskPixelBuffer)
        let originalImage = CIImage(image: self)!

        // Scale mask to match original image size
        let scaleX = originalImage.extent.width / maskImage.extent.width
        let scaleY = originalImage.extent.height / maskImage.extent.height
        let scaledMask = maskImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        switch returnResult {
        case .finalImage:
            // Blend original image with mask to get person with transparent background
            guard let blendFilter = CIFilter(name: "CIBlendWithMask") else {
                print("[BackgroundRemoval] Failed to create blend filter")
                return nil
            }
            blendFilter.setValue(originalImage, forKey: kCIInputImageKey)
            blendFilter.setValue(scaledMask, forKey: kCIInputMaskImageKey)

            guard let outputImage = blendFilter.outputImage else {
                print("[BackgroundRemoval] Failed to apply mask")
                return nil
            }

            let context = CIContext()
            guard let cgImage = context.createCGImage(outputImage, from: outputImage.extent) else {
                print("[BackgroundRemoval] Failed to create CGImage")
                return nil
            }

            return UIImage(cgImage: cgImage)

        case .mask:
            // Return just the mask
            let context = CIContext()
            guard let cgImage = context.createCGImage(scaledMask, from: scaledMask.extent) else {
                print("[BackgroundRemoval] Failed to create mask CGImage")
                return nil
            }
            return UIImage(cgImage: cgImage)

        case .background:
            // Invert mask to get background only
            guard let invertFilter = CIFilter(name: "CIColorInvert") else {
                print("[BackgroundRemoval] Failed to create invert filter")
                return nil
            }
            invertFilter.setValue(scaledMask, forKey: kCIInputImageKey)
            guard let invertedMask = invertFilter.outputImage else {
                print("[BackgroundRemoval] Failed to invert mask")
                return nil
            }

            guard let blendFilter = CIFilter(name: "CIBlendWithMask") else {
                print("[BackgroundRemoval] Failed to create blend filter")
                return nil
            }
            blendFilter.setValue(originalImage, forKey: kCIInputImageKey)
            blendFilter.setValue(invertedMask, forKey: kCIInputMaskImageKey)

            guard let outputImage = blendFilter.outputImage else {
                print("[BackgroundRemoval] Failed to apply inverted mask")
                return nil
            }

            let context = CIContext()
            guard let cgImage = context.createCGImage(outputImage, from: outputImage.extent) else {
                print("[BackgroundRemoval] Failed to create background CGImage")
                return nil
            }

            return UIImage(cgImage: cgImage)
        }
    }
}
