import Foundation

#if !os(macOS)
import UIKit
#endif

@available(iOS 13, macOS 10.15, *)
public class DataGroup2 : DataGroup {
    public private(set) var nrImages : Int = 0
    public private(set) var versionNumber : Int = 0
    public private(set) var lengthOfRecord : Int = 0
    public private(set) var numberOfFacialImages : Int = 0
    public private(set) var facialRecordDataLength : Int = 0
    public private(set) var nrFeaturePoints : Int = 0
    public private(set) var gender : Int = 0
    public private(set) var eyeColor : Int = 0
    public private(set) var hairColor : Int = 0
    public private(set) var featureMask : Int = 0
    public private(set) var expression : Int = 0
    public private(set) var poseAngle : Int = 0
    public private(set) var poseAngleUncertainty : Int = 0
    public private(set) var faceImageType : Int = 0
    public private(set) var imageDataType : Int = 0
    public private(set) var imageWidth : Int = 0
    public private(set) var imageHeight : Int = 0
    public private(set) var imageColorSpace : Int = 0
    public private(set) var sourceType : Int = 0
    public private(set) var deviceType : Int = 0
    public private(set) var quality : Int = 0
    public private(set) var imageData : [UInt8] = []
    
    
#if !os(macOS)
func getImage() -> UIImage? {
        if imageData.count == 0 {
            return nil
        }
        
        let data = Data(imageData)
        
        // Try creating image with full JP2 data first
        print("DataGroup2 getImage: Attempting to decode image (size: \(data.count) bytes)")
        
        if let imageSource = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) {
            print("DataGroup2 getImage: Image source created with full data")
            print("DataGroup2 getImage: Type: \(CGImageSourceGetType(imageSource) ?? "unknown" as CFString)")
            print("DataGroup2 getImage: Image count: \(CGImageSourceGetCount(imageSource))")
            
            if let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, [kCGImageSourceShouldCache: false] as CFDictionary) {
                let image = UIImage(cgImage: cgImage)
                print("DataGroup2 getImage: ✓ Successfully created UIImage with full JP2 data")
                return image
            } else {
                print("DataGroup2 getImage: ✗ Failed to create CGImage from full JP2 data")
            }
        } else {
            print("DataGroup2 getImage: ✗ Failed to create image source with full JP2 data")
        }
        
        // Fallback: Try extracting just the JPEG2000 codestream from jp2c box
        // Some iOS versions can decode the raw codestream but not the JP2 wrapper
        print("DataGroup2 getImage: Trying fallback - extract codestream only")
        
        if let jp2cOffset = findJP2CBox(in: imageData) {
            let codestreamStart = jp2cOffset + 8 // Skip 8-byte box header
            let codestreamData = Data(imageData[codestreamStart...])
            print("DataGroup2 getImage: Extracted codestream from offset \(codestreamStart), size: \(codestreamData.count) bytes")
            
            if let imageSource = CGImageSourceCreateWithData(codestreamData as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) {
                print("DataGroup2 getImage: Image source created with codestream")
                print("DataGroup2 getImage: Type: \(CGImageSourceGetType(imageSource) ?? "unknown" as CFString)")
                print("DataGroup2 getImage: Image count: \(CGImageSourceGetCount(imageSource))")
                
                if let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, [kCGImageSourceShouldCache: false] as CFDictionary) {
                    let image = UIImage(cgImage: cgImage)
                    print("DataGroup2 getImage: ✓ Successfully created UIImage with codestream only!")
                    return image
                } else {
                    print("DataGroup2 getImage: ✗ Failed to create CGImage from codestream")
                }
            } else {
                print("DataGroup2 getImage: ✗ Failed to create image source with codestream")
            }
        } else {
            print("DataGroup2 getImage: ✗ Could not find jp2c box for codestream extraction")
        }
        
        // Final fallback: Try UIImage directly
        print("DataGroup2 getImage: Final fallback - trying UIImage(data:)")
        if let image = UIImage(data: data) {
            print("DataGroup2 getImage: ✓ UIImage(data:) succeeded")
            return image
        }
        
        print("DataGroup2 getImage: ✗ All decoding methods failed")
        return nil
    }
#endif

    required init( _ data : [UInt8] ) throws {
        try super.init(data)
        datagroupType = .DG2
    }
    
    override func parse(_ data: [UInt8]) throws {
        var tag = try getNextTag()
        if tag != 0x7F61 {
            throw PassportReaderError.InvalidResponse
        }
        _ = try getNextLength()
        
        // Tag should be 0x02
        tag = try getNextTag()
        if  tag != 0x02 {
            throw PassportReaderError.InvalidResponse
        }
        nrImages = try Int(getNextValue()[0])
        
        // Next tag is 0x7F60
        tag = try getNextTag()
        if tag != 0x7F60 {
            throw PassportReaderError.InvalidResponse
        }
        _ = try getNextLength()
        
        // Next tag is 0xA1 (Biometric Header Template) - don't care about this
        tag = try getNextTag()
        if tag != 0xA1 {
            throw PassportReaderError.InvalidResponse
        }
        _ = try getNextValue()
        
        // Now we get to the good stuff - next tag is either 5F2E or 7F2E
        tag = try getNextTag()
        if tag != 0x5F2E && tag != 0x7F2E {
            throw PassportReaderError.InvalidResponse
        }
        let value = try getNextValue()
        
        try parseISO19794_5( data:value )
    }
    
    func findLastEOCMarker(in data: [UInt8]) -> Int? {
        // Search backwards for the JPEG2000 EOC marker (0xFF 0xD9)
        // Start from the end and work backwards
        for i in stride(from: data.count - 2, through: 0, by: -1) {
            if data[i] == 0xFF && data[i + 1] == 0xD9 {
                return i
            }
        }
        return nil
    }
    
    func findJP2CBox(in data: [UInt8]) -> Int? {
        // Search for the jp2c box (contains JPEG2000 codestream)
        // Look for the "jp2c" signature (0x6A 0x70 0x32 0x63)
        for i in 0..<data.count - 4 {
            if data[i] == 0x6A && data[i+1] == 0x70 && data[i+2] == 0x32 && data[i+3] == 0x63 {
                // Found "jp2c", the box starts 4 bytes before this (at the length field)
                if i >= 4 {
                    return i - 4
                }
            }
        }
        return nil
    }
    
    func parseJP2Boxes(data: [UInt8]) throws -> [UInt8] {
        // Parse JP2 box structure to find the actual end of valid data
        // JP2 format: each box has 4-byte length (big-endian) + 4-byte type + data
        var offset = 0
        var lastValidOffset = 0
        
        while offset < data.count {
            // Need at least 8 bytes for box header
            guard offset + 8 <= data.count else {
                break
            }
            
            // Read box length (big-endian 32-bit integer)
            var boxLength = (Int(data[offset]) << 24) |
                           (Int(data[offset + 1]) << 16) |
                           (Int(data[offset + 2]) << 8) |
                           Int(data[offset + 3])
            
            // Read box type (4 characters)
            let boxType = String(bytes: data[offset + 4..<offset + 8], encoding: .ascii) ?? ""
            
            print("DataGroup2 JP2 box: type=\(boxType), length=\(boxLength), offset=\(offset)")
            
            // Handle special box length values
            if boxLength == 0 {
                // Length 0 means this box extends to the end of the file
                boxLength = data.count - offset
                print("DataGroup2 JP2 box length 0 means extends to EOF, actual length=\(boxLength)")
            } else if boxLength == 1 {
                // Length 1 means there's an extended 64-bit length field
                guard offset + 16 <= data.count else {
                    print("DataGroup2 JP2 not enough data for extended length")
                    break
                }
                // Read 64-bit length (we'll just use the lower 32 bits for now)
                boxLength = (Int(data[offset + 8]) << 24) |
                           (Int(data[offset + 9]) << 16) |
                           (Int(data[offset + 10]) << 8) |
                           Int(data[offset + 11])
                print("DataGroup2 JP2 extended box length=\(boxLength)")
            } else if boxLength < 8 {
                // Invalid box length, stop here
                print("DataGroup2 JP2 invalid box length, stopping at offset \(lastValidOffset)")
                break
            }
            
            // Check if the box extends beyond our data
            if offset + boxLength > data.count {
                print("DataGroup2 JP2 box extends beyond data, stopping at offset \(lastValidOffset)")
                break
            }
            
            lastValidOffset = offset + boxLength
            offset += boxLength
        }
        
        if lastValidOffset > 0 && lastValidOffset <= data.count {
            print("DataGroup2 JP2 trimming from \(data.count) to \(lastValidOffset) bytes")
            return [UInt8](data[0..<lastValidOffset])
        }
        
        return data
    }
    
    func parseISO19794_5( data : [UInt8] ) throws {
        // Validate header - 'F', 'A' 'C' 0x00 - 0x46414300
        if data[0] != 0x46 && data[1] != 0x41 && data[2] != 0x43 && data[3] != 0x00 {
            throw PassportReaderError.InvalidResponse
        }
        
        var offset = 4
        versionNumber = binToInt(data[offset..<offset+4])
        offset += 4
        lengthOfRecord = binToInt(data[offset..<offset+4])
        offset += 4
        numberOfFacialImages = binToInt(data[offset..<offset+2])
        offset += 2
        
        let facialRecordStart = offset
        facialRecordDataLength = binToInt(data[offset..<offset+4])
        offset += 4
        nrFeaturePoints = binToInt(data[offset..<offset+2])
        offset += 2
        gender = binToInt(data[offset..<offset+1])
        offset += 1
        eyeColor = binToInt(data[offset..<offset+1])
        offset += 1
        hairColor = binToInt(data[offset..<offset+1])
        offset += 1
        featureMask = binToInt(data[offset..<offset+3])
        offset += 3
        expression = binToInt(data[offset..<offset+2])
        offset += 2
        poseAngle = binToInt(data[offset..<offset+3])
        offset += 3
        poseAngleUncertainty = binToInt(data[offset..<offset+3])
        offset += 3
        
        // Features (not handled). There shouldn't be any but if for some reason there were,
        // then we are going to skip over them
        // The Feature block is 8 bytes
        offset += nrFeaturePoints * 8
        
        faceImageType = binToInt(data[offset..<offset+1])
        offset += 1
        imageDataType = binToInt(data[offset..<offset+1])
        offset += 1
        imageWidth = binToInt(data[offset..<offset+2])
        offset += 2
        imageHeight = binToInt(data[offset..<offset+2])
        offset += 2
        imageColorSpace = binToInt(data[offset..<offset+1])
        offset += 1
        sourceType = binToInt(data[offset..<offset+1])
        offset += 1
        deviceType = binToInt(data[offset..<offset+2])
        offset += 2
        quality = binToInt(data[offset..<offset+2])
        offset += 2
        
        // Calculate the exact image data length based on facialRecordDataLength
        // facialRecordDataLength includes all data from facialRecordStart
        let metadataLength = offset - facialRecordStart
        let imageDataLength = facialRecordDataLength - metadataLength
        
        print("DataGroup2 facialRecordDataLength: \(facialRecordDataLength)")
        print("DataGroup2 metadataLength: \(metadataLength)")
        print("DataGroup2 calculated imageDataLength: \(imageDataLength)")
        
        
        // Make sure that the image data at least has a valid header
        // Either JPG or JPEG2000
        
        let jpegHeader : [UInt8] = [0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46]
        let jpeg2000BitmapHeader : [UInt8] = [0x00,0x00,0x00,0x0c,0x6a,0x50,0x20,0x20,0x0d,0x0a]
        let jpeg2000CodestreamBitmapHeader : [UInt8] = [0xff,0x4f,0xff,0x51]
        
        if data.count < offset+jpeg2000CodestreamBitmapHeader.count {
            throw PassportReaderError.UnknownImageFormat
        }

        
        if [UInt8](data[offset..<offset+jpegHeader.count]) != jpegHeader &&
            [UInt8](data[offset..<offset+jpeg2000BitmapHeader.count]) != jpeg2000BitmapHeader &&
            [UInt8](data[offset..<offset+jpeg2000CodestreamBitmapHeader.count]) != jpeg2000CodestreamBitmapHeader {
            throw PassportReaderError.UnknownImageFormat
        }
        
        // Extract exactly the amount of image data specified by the length field
        let endOffset = offset + imageDataLength
        guard endOffset <= data.count else {
            throw PassportReaderError.InvalidResponse
        }
        var rawImageData = [UInt8](data[offset..<endOffset])
        
        // Detect image format based on header
        let isJPEG = [UInt8](data[offset..<offset+jpegHeader.count]) == jpegHeader
        let isJPEG2000Bitmap = [UInt8](data[offset..<offset+jpeg2000BitmapHeader.count]) == jpeg2000BitmapHeader
        let isJPEG2000Codestream = [UInt8](data[offset..<offset+jpeg2000CodestreamBitmapHeader.count]) == jpeg2000CodestreamBitmapHeader
        
        // For JPEG files, trim trailing zeros and validate end marker
        if isJPEG {
            // Trim trailing zero bytes for JPEG
            while rawImageData.last == 0 && rawImageData.count > 2 {
                rawImageData.removeLast()
            }
        } else if isJPEG2000Bitmap {
            // For JP2 format, check the codestream inside jp2c box
            // The jp2c box should be at a known offset (usually after jP, ftyp, jp2h boxes)
            // Find the jp2c box and verify its codestream
            if let jp2cStart = findJP2CBox(in: rawImageData) {
                let codestreamStart = jp2cStart + 8 // Skip 8-byte box header (4-byte length + 4-byte type)
                print("DataGroup2 JP2C box found at offset \(jp2cStart)")
                print("DataGroup2 Codestream starts at \(codestreamStart)")
                
                if codestreamStart + 10 < rawImageData.count {
                    let codestreamHeader = Array(rawImageData[codestreamStart..<codestreamStart+10])
                    print("DataGroup2 Codestream first 10 bytes: \(codestreamHeader)")
                    
                    // JPEG2000 codestream should start with SOC marker (0xFF 0x4F)
                    if codestreamHeader[0] != 0xFF || codestreamHeader[1] != 0x4F {
                        print("DataGroup2 WARNING: Codestream doesn't start with SOC marker (0xFF 0x4F)")
                    }
                }
            }
            
            // Parse box structure
            rawImageData = try parseJP2Boxes(data: rawImageData)
            
            // Additional trimming: find the JPEG2000 EOC marker (0xFF 0xD9) and trim anything after it
            if let eocIndex = findLastEOCMarker(in: rawImageData) {
                let trimmedLength = eocIndex + 2
                print("DataGroup2 JP2 EOC marker found at \(eocIndex), would trim to \(trimmedLength) (current: \(rawImageData.count))")
                if trimmedLength < rawImageData.count {
                    print("DataGroup2 JP2 trimming from \(rawImageData.count) to \(trimmedLength)")
                    rawImageData = [UInt8](rawImageData[0..<trimmedLength])
                }
            }
        } else if isJPEG2000Codestream {
            // For JPEG2000 codestream, trim trailing zeros
            while rawImageData.last == 0 && rawImageData.count > 2 {
                rawImageData.removeLast()
            }
        }
        
        print("DataGroup2 imageFormat: JPEG=\(isJPEG), JP2=\(isJPEG2000Bitmap), J2K=\(isJPEG2000Codestream)")
        print("DataGroup2 imageData length: \(rawImageData.count)")
        print("DataGroup2 imageData first 20 bytes: \(Array(rawImageData.prefix(20)))")
        print("DataGroup2 imageData last 20 bytes: \(Array(rawImageData.suffix(20)))")
        imageData = rawImageData
    }
}
