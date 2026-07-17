//
//  OpenCVWrapper.mm
//  OpenCV-mobile implementation for MRZ image preprocessing
//  Equivalent to Android's OpenCVImagePreprocessor
//
//  opencv-mobile: https://github.com/nihui/opencv-mobile
//

#import "OpenCVWrapper.h"

// OpenCV-mobile headers
// Must be imported before any UIKit/Cocoa headers in .mm files
#ifdef __cplusplus
#import <opencv2/core/core.hpp>
#import <opencv2/imgproc/imgproc.hpp>
#endif

using namespace cv;

// MARK: - OpenCVPreprocessingConfig Implementation

@implementation OpenCVPreprocessingConfig

+ (instancetype)defaultConfig {
    OpenCVPreprocessingConfig *config = [[OpenCVPreprocessingConfig alloc] init];
    config.convertToGrayscale = YES;
    config.binarize = YES;
    config.scaleToDPI = YES;
    config.applyMorphology = YES;
    return config;
}

@end

// MARK: - OpenCVWrapper Implementation

@implementation OpenCVWrapper

// Target dimensions for MRZ processing (matches Android implementation)
static const int TARGET_MRZ_HEIGHT_TD3 = 200;  // Passports (2-line)
static const int TARGET_MRZ_HEIGHT_TD1 = 160;  // ID cards (3-line)
static const int MAX_MRZ_HEIGHT = 240;         // Prevent extreme upscaling

// Threshold parameters (alternating values for different lighting conditions)
static const int blockSizes[] = {53, 65};
static const double constants[] = {32.0, 44.0};

#pragma mark - Public Methods

+ (BOOL)isAvailable {
    // OpenCV-mobile is statically linked, so it's always available if compiled
    return YES;
}

+ (UIImage *)preprocessImage:(UIImage *)image
                      config:(OpenCVPreprocessingConfig *)config
                documentType:(nullable NSString *)documentType
                 frameNumber:(NSInteger)frameNumber
          enableDebugLogging:(BOOL)enableDebugLogging {
    
    if (!image) {
        if (enableDebugLogging) NSLog(@"OpenCVWrapper: Input image is nil");
        return image;
    }
    
    // Convert UIImage to cv::Mat
    Mat src = [self cvMatFromUIImage:image];
    if (src.empty()) {
        if (enableDebugLogging) NSLog(@"OpenCVWrapper: Failed to convert UIImage to cv::Mat");
        return image;
    }
    
    Mat processed = src.clone();
    
    @try {
        // Step 1: Convert to grayscale
        if (config.convertToGrayscale) {
            Mat gray;
            if (processed.channels() == 4) {
                cvtColor(processed, gray, COLOR_BGRA2GRAY);
            } else if (processed.channels() == 3) {
                cvtColor(processed, gray, COLOR_BGR2GRAY);
            } else {
                gray = processed.clone();
            }
            processed = gray;
            if (enableDebugLogging) NSLog(@"OpenCVWrapper: Converted to grayscale");
        }
        
        // Step 2: Scale to optimal DPI for OCR
        if (config.scaleToDPI) {
            int targetHeight;
            if ([documentType.uppercaseString isEqualToString:@"TD1"]) {
                targetHeight = TARGET_MRZ_HEIGHT_TD1;
            } else {
                targetHeight = TARGET_MRZ_HEIGHT_TD3;
            }
            
            processed = [self scaleMatToOptimalSize:processed
                                       targetHeight:targetHeight
                                          maxHeight:MAX_MRZ_HEIGHT
                                 enableDebugLogging:enableDebugLogging];
        }
        
        // Step 3: Adaptive thresholding (binarization)
        if (config.binarize) {
            // Ensure input is valid 8-bit grayscale
            if (processed.channels() != 1 || processed.depth() != CV_8U) {
                if (enableDebugLogging) {
                    NSLog(@"OpenCVWrapper: Converting to 8-bit grayscale before binarization (channels=%d, depth=%d)",
                          processed.channels(), processed.depth());
                }
                Mat gray;
                if (processed.channels() > 1) {
                    cvtColor(processed, gray, COLOR_BGR2GRAY);
                } else {
                    processed.convertTo(gray, CV_8U);
                }
                processed = gray;
            }
            
            Mat binary;
            int index = frameNumber % 3;
            if (index != 2) {
              int blockSize = blockSizes[index];
              double constantC = constants[index];
              
              if (enableDebugLogging) {
                NSLog(@"OpenCVWrapper: Frame %ld: Using adaptive threshold values - blockSize=%d, C=%.1f",
                      (long)frameNumber, blockSize, constantC);
              }
              
              adaptiveThreshold(
                                processed,
                                binary,
                                255.0,                           // maxValue
                                ADAPTIVE_THRESH_MEAN_C,          // adaptiveMethod (better for MRZ)
                                THRESH_BINARY,                   // thresholdType
                                blockSize,                       // blockSize
                                constantC                        // C constant
                                );
              processed = binary;
            }
        }
        
        // Step 4: Morphological close to reinforce strokes and remove noise
        if (config.applyMorphology && processed.channels() == 1) {
            Mat morph;
            Mat kernel = getStructuringElement(MORPH_RECT, cv::Size(3, 3));
            morphologyEx(processed, morph, MORPH_CLOSE, kernel);
            processed = morph;
            if (enableDebugLogging) NSLog(@"OpenCVWrapper: Applied morphological close");
        }
        
        // Convert cv::Mat back to UIImage
        // If Mat is 1-channel (binary/grayscale), convert to BGRA first for proper display
        Mat finalMat;
        if (processed.channels() == 1) {
            cvtColor(processed, finalMat, COLOR_GRAY2BGRA);
        } else {
            finalMat = processed;
        }
        
        UIImage *result = [self UIImageFromCVMat:finalMat];
        
        if (result) {
            return result;
        } else {
            if (enableDebugLogging) NSLog(@"OpenCVWrapper: Failed to convert result Mat to UIImage");
            return image;
        }
        
    } @catch (NSException *exception) {
        NSLog(@"OpenCVWrapper: Exception during preprocessing: %@", exception);
        return image;
    }
}

+ (UIImage *)convertToGrayscale:(UIImage *)image {
    Mat src = [self cvMatFromUIImage:image];
    if (src.empty()) return image;
    
    Mat gray;
    if (src.channels() == 4) {
        cvtColor(src, gray, COLOR_BGRA2GRAY);
    } else if (src.channels() == 3) {
        cvtColor(src, gray, COLOR_BGR2GRAY);
    } else {
        gray = src;
    }
    
    Mat result;
    cvtColor(gray, result, COLOR_GRAY2BGRA);
    return [self UIImageFromCVMat:result];
}

+ (UIImage *)applyAdaptiveThreshold:(UIImage *)image
                          blockSize:(int)blockSize
                          constantC:(double)constantC {
    Mat src = [self cvMatFromUIImage:image];
    if (src.empty()) return image;
    
    // Convert to grayscale if needed
    Mat gray;
    if (src.channels() > 1) {
        cvtColor(src, gray, COLOR_BGR2GRAY);
    } else {
        gray = src;
    }
    
    // Apply adaptive threshold
    Mat binary;
    adaptiveThreshold(gray, binary, 255.0, ADAPTIVE_THRESH_MEAN_C, THRESH_BINARY, blockSize, constantC);
    
    // Convert back to BGRA for display
    Mat result;
    cvtColor(binary, result, COLOR_GRAY2BGRA);
    return [self UIImageFromCVMat:result];
}

+ (UIImage *)applyMorphologicalClose:(UIImage *)image kernelSize:(int)kernelSize {
    Mat src = [self cvMatFromUIImage:image];
    if (src.empty()) return image;
    
    // Convert to grayscale if needed
    Mat gray;
    if (src.channels() > 1) {
        cvtColor(src, gray, COLOR_BGR2GRAY);
    } else {
        gray = src;
    }
    
    // Apply morphological close
    Mat morph;
    Mat kernel = getStructuringElement(MORPH_RECT, cv::Size(kernelSize, kernelSize));
    morphologyEx(gray, morph, MORPH_CLOSE, kernel);
    
    // Convert back to BGRA for display
    Mat result;
    cvtColor(morph, result, COLOR_GRAY2BGRA);
    return [self UIImageFromCVMat:result];
}

+ (UIImage *)scaleImage:(UIImage *)image
           targetHeight:(int)targetHeight
              maxHeight:(int)maxHeight {
    Mat src = [self cvMatFromUIImage:image];
    if (src.empty()) return image;
    
    Mat scaled = [self scaleMatToOptimalSize:src
                                targetHeight:targetHeight
                                   maxHeight:maxHeight
                          enableDebugLogging:NO];
    
    return [self UIImageFromCVMat:scaled];
}

#pragma mark - Private Helper Methods

/// Scale cv::Mat to optimal size for OCR
+ (Mat)scaleMatToOptimalSize:(Mat)mat
                targetHeight:(int)targetHeight
                   maxHeight:(int)maxHeight
          enableDebugLogging:(BOOL)enableDebugLogging {
    
    int currentHeight = mat.rows;
    int currentWidth = mat.cols;
    
    if (currentHeight < targetHeight) {
        // Upscale
        double scaleFactor = (double)targetHeight / currentHeight;
        int newWidth = (int)(currentWidth * scaleFactor);
        int newHeight = targetHeight;
        
        Mat scaled;
        resize(mat, scaled, cv::Size(newWidth, newHeight), 0, 0, INTER_CUBIC);
        
        if (enableDebugLogging) {
            NSLog(@"OpenCVWrapper: Upscaled %dx%d -> %dx%d (factor: %.2f)",
                  currentWidth, currentHeight, newWidth, newHeight, scaleFactor);
        }
        return scaled;
    }
    
    if (currentHeight > maxHeight) {
        // Downscale
        double scaleFactor = (double)maxHeight / currentHeight;
        int newWidth = (int)(currentWidth * scaleFactor);
        int newHeight = maxHeight;
        
        Mat scaled;
        resize(mat, scaled, cv::Size(newWidth, newHeight), 0, 0, INTER_AREA);
        
        if (enableDebugLogging) {
            NSLog(@"OpenCVWrapper: Downscaled %dx%d -> %dx%d (factor: %.2f)",
                  currentWidth, currentHeight, newWidth, newHeight, scaleFactor);
        }
        return scaled;
    }
    
    if (enableDebugLogging) {
        NSLog(@"OpenCVWrapper: No scaling needed (height=%d within target range)", currentHeight);
    }
    return mat.clone();
}

/// Convert UIImage to cv::Mat
+ (Mat)cvMatFromUIImage:(UIImage *)image {
    CGColorSpaceRef colorSpace = CGImageGetColorSpace(image.CGImage);
    CGFloat cols = image.size.width;
    CGFloat rows = image.size.height;
    
    Mat cvMat(rows, cols, CV_8UC4); // 8 bits per component, 4 channels (BGRA)
    
    CGContextRef contextRef = CGBitmapContextCreate(
        cvMat.data,                                 // Pointer to data
        cols,                                       // Width
        rows,                                       // Height
        8,                                          // Bits per component
        cvMat.step[0],                              // Bytes per row
        colorSpace,                                 // Color space
        kCGImageAlphaNoneSkipLast | kCGBitmapByteOrderDefault // Bitmap info
    );
    
    CGContextDrawImage(contextRef, CGRectMake(0, 0, cols, rows), image.CGImage);
    CGContextRelease(contextRef);
    
    // Convert from RGBA to BGRA (OpenCV uses BGR format)
    Mat bgrMat;
    cvtColor(cvMat, bgrMat, COLOR_RGBA2BGRA);
    
    return bgrMat;
}

/// Convert cv::Mat to UIImage
+ (UIImage *)UIImageFromCVMat:(Mat)cvMat {
    NSData *data = [NSData dataWithBytes:cvMat.data length:cvMat.elemSize() * cvMat.total()];
    
    CGColorSpaceRef colorSpace;
    
    if (cvMat.channels() == 1) {
        colorSpace = CGColorSpaceCreateDeviceGray();
    } else {
        colorSpace = CGColorSpaceCreateDeviceRGB();
    }
    
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)data);
    
    CGImageRef imageRef;
    if (cvMat.channels() == 1) {
        imageRef = CGImageCreate(
            cvMat.cols,
            cvMat.rows,
            8,
            8 * cvMat.channels(),
            cvMat.step[0],
            colorSpace,
            kCGImageAlphaNone | kCGBitmapByteOrderDefault,
            provider,
            NULL,
            false,
            kCGRenderingIntentDefault
        );
    } else {
        imageRef = CGImageCreate(
            cvMat.cols,
            cvMat.rows,
            8,
            8 * cvMat.channels(),
            cvMat.step[0],
            colorSpace,
            kCGImageAlphaNoneSkipLast | kCGBitmapByteOrderDefault,
            provider,
            NULL,
            false,
            kCGRenderingIntentDefault
        );
    }
    
    UIImage *finalImage = [UIImage imageWithCGImage:imageRef];
    
    CGImageRelease(imageRef);
    CGDataProviderRelease(provider);
    CGColorSpaceRelease(colorSpace);
    
    return finalImage;
}

@end

