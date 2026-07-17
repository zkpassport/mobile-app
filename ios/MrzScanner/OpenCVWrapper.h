//
//  OpenCVWrapper.h
//  OpenCV-mobile wrapper for MRZ image preprocessing
//  Equivalent to Android's OpenCVImagePreprocessor
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Configuration for image preprocessing
@interface OpenCVPreprocessingConfig : NSObject

@property (nonatomic, assign) BOOL convertToGrayscale;
@property (nonatomic, assign) BOOL binarize;
@property (nonatomic, assign) BOOL scaleToDPI;
@property (nonatomic, assign) BOOL applyMorphology;

+ (instancetype)defaultConfig;

@end

/// OpenCV-based image preprocessing for MRZ OCR
/// Implements the same pipeline as Android's OpenCVImagePreprocessor
@interface OpenCVWrapper : NSObject

/// Check if OpenCV is available and properly initialized
+ (BOOL)isAvailable;

/// Preprocess an image for MRZ OCR using OpenCV
/// @param image The input UIImage
/// @param config Preprocessing configuration
/// @param documentType Optional document type ("TD1", "TD3", etc.)
/// @param frameNumber Frame number for alternating threshold parameters
/// @param enableDebugLogging Whether to enable debug logging
/// @return Preprocessed UIImage
+ (UIImage *)preprocessImage:(UIImage *)image
                      config:(OpenCVPreprocessingConfig *)config
                documentType:(nullable NSString *)documentType
                 frameNumber:(NSInteger)frameNumber
          enableDebugLogging:(BOOL)enableDebugLogging;

/// Convert UIImage to grayscale using OpenCV
/// @param image Input image
/// @return Grayscale image
+ (UIImage *)convertToGrayscale:(UIImage *)image;

/// Apply adaptive threshold (binarization) using OpenCV
/// @param image Input grayscale image
/// @param blockSize Block size for adaptive threshold
/// @param constantC Constant subtracted from the mean
/// @return Binary image
+ (UIImage *)applyAdaptiveThreshold:(UIImage *)image
                          blockSize:(int)blockSize
                          constantC:(double)constantC;

/// Apply morphological close operation using OpenCV
/// @param image Input binary image
/// @param kernelSize Size of the structuring element
/// @return Processed image
+ (UIImage *)applyMorphologicalClose:(UIImage *)image
                          kernelSize:(int)kernelSize;

/// Scale image to optimal size for OCR
/// @param image Input image
/// @param targetHeight Target height in pixels
/// @param maxHeight Maximum allowed height
/// @return Scaled image
+ (UIImage *)scaleImage:(UIImage *)image
           targetHeight:(int)targetHeight
              maxHeight:(int)maxHeight;

@end

NS_ASSUME_NONNULL_END

