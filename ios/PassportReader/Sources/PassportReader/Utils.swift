import Foundation
import CommonCrypto
import CryptoTokenKit
import BigInt

#if canImport(CryptoKit)
    import CryptoKit
#endif

// pivotYear defaults to current year + 15 years (to cover long passport expiry)
func convertYYMMDDToDate(from dateString: String, pivotYear: Int = Calendar.current.component(.year, from: Date()) + 15) -> Date? {
    let dateFormatter = DateFormatter()
    dateFormatter.dateFormat = "yyMMdd"
    
    // Setting the two digit year start
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let startDateComponents = DateComponents(year: pivotYear - 100, month: 1, day: 1)
    dateFormatter.twoDigitStartDate = calendar.date(from: startDateComponents)
    
    return dateFormatter.date(from: dateString)
}

func titleCaseName(_ name: String) -> String {
    let medialCapitals = ["McDonald", "MacDonald", "O'Connell", "D'Angelo"] // Add more as needed
    let lowercasedMedialCapitals = Dictionary(uniqueKeysWithValues: medialCapitals.map { ($0.lowercased(), $0) })

    let titleCased = name.localizedCapitalized.split(separator: " ").map { word -> String in
        if let correctForm = lowercasedMedialCapitals[String(word).lowercased()] {
            return correctForm
        }
        return String(word)
    }.joined(separator: " ")

    return titleCased
}

private extension UInt8 {
    var hexString: String {
        let string = String(self, radix: 16)
        return (self < 16 ? "0" + string : string)
    }
}


extension FileManager {
    static var documentDir : URL {
        return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    }
}

extension StringProtocol {
    subscript(bounds: CountableClosedRange<Int>) -> SubSequence {
        let start = index(startIndex, offsetBy: bounds.lowerBound)
        let end = index(start, offsetBy: bounds.count)
        return self[start..<end]
    }
    
    subscript(bounds: CountableRange<Int>) -> SubSequence {
        let start = index(startIndex, offsetBy: bounds.lowerBound)
        let end = index(start, offsetBy: bounds.count)
        return self[start..<end]
    }
    
    func index(of string: Self, options: String.CompareOptions = []) -> Index? {
        return range(of: string, options: options)?.lowerBound
    }

}


public func binToHexRep( _ val : [UInt8], asArray : Bool = false ) -> String {
    var string = asArray ? "[" : ""
    for x in val {
        if asArray {
            string += String(format:"0x%02x, ", x )

        } else {
            string += String(format:"%02x", x )
        }
    }
    string += asArray ? "]" : ""
    return asArray ? string : string.uppercased()
}

public func binToHexRep( _ val : UInt8 ) -> String {
    let string = String(format:"%02x", val ).uppercased()
    return string
}

public func binToHex( _ val: UInt8 ) -> Int {
    let hexRep = String(format:"%02X", val)
    return Int(hexRep, radix:16)!
}

public func binToHex( _ val: [UInt8] ) -> UInt64 {
    let hexVal = UInt64(binToHexRep(val), radix:16)!
    return hexVal
}

public func binToHex( _ val: ArraySlice<UInt8> ) -> UInt64 {
    return binToHex( [UInt8](val) )
}


public func hexToBin( _ val : UInt64 ) -> [UInt8] {
    let hexRep = String(format:"%lx", val)
    return hexRepToBin( hexRep)
}

public func binToInt( _ val: ArraySlice<UInt8> ) -> Int {
    let hexVal = binToInt( [UInt8](val) )
    return hexVal
}

public func binToInt( _ val: [UInt8] ) -> Int {
    let hexVal = Int(binToHexRep(val), radix:16)!
    return hexVal
}

public func intToBin(_ data : Int, pad : Int = 2) -> [UInt8] {
    if pad == 2 {
        let hex = String(format:"%02x", data)
        return hexRepToBin(hex)
    } else {
        let hex = String(format:"%04x", data)
        return hexRepToBin(hex)

    }
}

/// 'AABB' --> \xaa\xbb'"""
public func hexRepToBin(_ val : String) -> [UInt8] {
    var output : [UInt8] = []
    var x = 0
    while x < val.count {
        if x+2 <= val.count {
            output.append( UInt8(val[x ..< x + 2], radix:16)! )
        } else {
            output.append( UInt8(val[x ..< x+1], radix:16)! )

        }
        x += 2
    }
    return output
}

public func xor(_ kifd : [UInt8], _ response_kicc : [UInt8] ) -> [UInt8] {
    var kseed = [UInt8]()
    for i in 0 ..< kifd.count {
        kseed.append( kifd[i] ^ response_kicc[i] )
    }
    return kseed
}

public func generateRandomUInt8Array( _ size: Int ) -> [UInt8] {
    
    var ret : [UInt8] = []
    for _ in 0 ..< size {
        ret.append( UInt8(arc4random_uniform(UInt32(UInt8.max) + 1)) )
    }
    return ret
}

public func pad(_ toPad : [UInt8], blockSize : Int) -> [UInt8] {
    
    var ret = toPad + [0x80]
    while ret.count % blockSize != 0 {
        ret.append(0x00)
    }
    return ret
}

public func unpad( _ tounpad : [UInt8]) -> [UInt8] {
    var i = tounpad.count-1
    while tounpad[i] == 0x00 {
        i -= 1
    }
    
    if tounpad[i] == 0x80 {
        return [UInt8](tounpad[0..<i])
    } else {
        // no padding
        return tounpad
    }
}

@available(iOS 13, macOS 10.15, *)
public func mac(algoName: SecureMessagingSupportedAlgorithms, key : [UInt8], msg : [UInt8]) -> [UInt8] {
    if algoName == .DES {
        return desMAC(key: key, msg: msg)
    } else {
        return aesMAC(key: key, msg: msg)
    }
}

@available(iOS 13, macOS 10.15, *)
public func desMAC(key : [UInt8], msg : [UInt8]) -> [UInt8]{
    
    let size = msg.count / 8
    var y : [UInt8] = [0,0,0,0,0,0,0,0]
    
    Log.verbose("Calc mac" )
    for i in 0 ..< size {
        let tmp = [UInt8](msg[i*8 ..< i*8+8])
        Log.verbose("x\(i): \(binToHexRep(tmp))" )
        y = DESEncrypt(key: [UInt8](key[0..<8]), message: tmp, iv: y)
        Log.verbose("y\(i): \(binToHexRep(y))" )
    }
    
    Log.verbose("y: \(binToHexRep(y))" )
    Log.verbose("bkey: \(binToHexRep([UInt8](key[8..<16])))" )
    Log.verbose("akey: \(binToHexRep([UInt8](key[0..<8])))" )
    let iv : [UInt8] = [0,0,0,0,0,0,0,0]
    let b = DESDecrypt(key: [UInt8](key[8..<16]), message: y, iv: iv, options:UInt32(kCCOptionECBMode))
    Log.verbose( "b: \(binToHexRep(b))" )
    let a = DESEncrypt(key: [UInt8](key[0..<8]), message: b, iv: iv, options:UInt32(kCCOptionECBMode))
    Log.verbose( "a: \(binToHexRep(a))" )
    
    return a
}

@available(iOS 13, macOS 10.15, *)
public func aesMAC( key: [UInt8], msg : [UInt8] ) -> [UInt8] {
    let mac = OpenSSLUtils.generateAESCMAC( key: key, message:msg )
    return mac
}

@available(iOS 13, macOS 10.15, *)
public func wrapDO( b : UInt8, arr : [UInt8] ) -> [UInt8] {
    let tag = TKBERTLVRecord(tag: TKTLVTag(b), value: Data(arr))
    let result = [UInt8](tag.data)
    return result;
}

@available(iOS 13, macOS 10.15, *)
public func unwrapDO( tag : UInt8, wrappedData : [UInt8]) throws -> [UInt8] {
    guard let rec = TKBERTLVRecord(from: Data(wrappedData)),
          rec.tag == tag else {
        throw PassportReaderError.InvalidASN1Value
    }
    return [UInt8](rec.value);
}


public func intToBytes( val: Int, removePadding:Bool) -> [UInt8] {
    if val == 0 {
        return [0]
    }
    var data = withUnsafeBytes(of: val.bigEndian, Array.init)

    if removePadding {
        // Remove initial 0 bytes
        for i in 0 ..< data.count {
            if data[i] != 0 {
                data = [UInt8](data[i...])
                break
            }
        }
    }
    return data
}

@available(iOS 13, macOS 10.15, *)
public func oidToBytes(oid : String, replaceTag : Bool) -> [UInt8] {
    var encOID = OpenSSLUtils.asn1EncodeOID(oid: oid)
    
    if replaceTag {
        // Replace tag (0x06) with 0x80
        encOID[0] = 0x80
    }
    return encOID
}



/// Take an asn.1 length, and return a couple with the decoded length in hexa and the total length of the encoding (1,2 or 3 bytes)
///
/// Using Basic Encoding Rules (BER):
/// If the first byte is <= 0x7F (0-127), then this is the total length of the data
/// If the first byte is 0x81 then the length is the value of the next byte
/// If the first byte is 0x82 then the length is the value of the next two bytes
/// If the first byte is 0x80 then the length is indefinite (never seen this and not sure exactle what it means)
/// e.g.
/// if the data was 0x02, 0x11, 0x12, then the amount of data we have to read is two bytes, and the actual data is [0x11, 0x12]
/// If the length was 0x81,0x80,....... then we know that the data length is contained in the next byte - 0x80 (128), so the amount of data to read is 128 bytes
/// If the length was 0x82,0x01,0x01,....... then we know that the data length is contained in the next 2 bytes - 0x01, 0x01 (257) so the amount of data to read is 257 bytes
///
/// @param data: A length value encoded in the asn.1 format.
/// @type data: A binary string.
/// @return: A tuple with the decoded hexa length and the length of the asn.1 encoded value.
/// @raise asn1Exception: If the parameter does not follow the asn.1 notation.

@available(iOS 13, macOS 10.15, *)
public func asn1Length( _ data: ArraySlice<UInt8> ) throws -> (Int, Int) {
    return try asn1Length( Array(data) )
}

@available(iOS 13, macOS 10.15, *)
public func asn1Length(_ data : [UInt8]) throws -> (Int, Int)  {
    if data[0] < 0x80 {
        return (Int(binToHex(data[0])), 1)
    }
    if data[0] == 0x81 {
        return (Int(binToHex(data[1])), 2)
    }
    if data[0] == 0x82 {
        let val = binToHex([UInt8](data[1..<3]))
        return (Int(val), 3)
    }
    
    throw PassportReaderError.CannotDecodeASN1Length
    
}

/// Convert a length to asn.1 format
/// @param data: The value to encode in asn.1
/// @type data: An integer (hexa)
/// @return: The asn.1 encoded value
/// @rtype: A binary string
/// @raise asn1Exception: If the parameter is too big, must be >= 0 and <= FFFF
@available(iOS 13, macOS 10.15, *)
public func toAsn1Length(_ data : Int) throws -> [UInt8] {
    if data < 0x80 {
        return hexRepToBin(String(format:"%02x", data))
    }
    if data >= 0x80 && data <= 0xFF {
        return [0x81] + hexRepToBin( String(format:"%02x",data))
    }
    if data >= 0x0100 && data <= 0xFFFF {
        return [0x82] + hexRepToBin( String(format:"%04x",data))
    }
    
    throw PassportReaderError.InvalidASN1Value
}
        


/// This function calculates a  Hash of the input data based on the input algorithm
/// @param data: a byte array of data
/// @param hashAlgorithm: the hash algorithm to be used - supported ones are SHA1, SHA224, SHA256, SHA384 and SHA512
///        Currently specifying any others return empty array
/// @return: A hash of the data
@available(iOS 13, macOS 10.15, *)
public func calcHash( data: [UInt8], hashAlgorithm: String ) throws -> [UInt8] {
    var ret : [UInt8] = []
    
    let hashAlgorithm = hashAlgorithm.lowercased()
    if hashAlgorithm == "sha1" {
        ret = calcSHA1Hash(data)
    } else if hashAlgorithm == "sha224" {
        ret = calcSHA224Hash(data)
    } else if hashAlgorithm == "sha256" {
        ret = calcSHA256Hash(data)
    } else if hashAlgorithm == "sha384" {
        ret = calcSHA384Hash(data)
    } else if hashAlgorithm == "sha512" {
        ret = calcSHA512Hash(data)
    } else {
        throw PassportReaderError.InvalidHashAlgorithmSpecified
    }
        
    return ret
}

@available(iOS 13, macOS 10.15, *)
public func calcHash(data: Data, hashAlgorithm: String) throws -> Data {
    var ret : [UInt8] = []
    let hashAlgorithm = hashAlgorithm.lowercased()
    if hashAlgorithm == "sha1" {
        ret = calcSHA1Hash([UInt8](data))
    } else if hashAlgorithm == "sha224" {
        ret = calcSHA224Hash([UInt8](data))
    } else if hashAlgorithm == "sha256" {
        ret = calcSHA256Hash([UInt8](data))
    } else if hashAlgorithm == "sha384" {
        ret = calcSHA384Hash([UInt8](data))
    } else if hashAlgorithm == "sha512" {
        ret = calcSHA512Hash([UInt8](data))
    } else {
        throw PassportReaderError.InvalidHashAlgorithmSpecified
    }
    return Data(ret)
}


/// This function calculates a SHA1 Hash of the input data
/// @param data: a byte array of data
/// @return: A SHA1 hash of the data
@available(iOS 13, macOS 10.15, *)
public func calcSHA1Hash( _ data: [UInt8] ) -> [UInt8] {
    #if canImport(CryptoKit)
    var sha1 = Insecure.SHA1()
    sha1.update(data: data)
    let hash = sha1.finalize()
    
    return Array(hash)
    #else
    fatalError("Couldn't import CryptoKit")
    #endif
}

/// This function calculates a SHA224 Hash of the input data
/// @param data: a byte array of data
/// @return: A SHA224 hash of the data
@available(iOS 13, macOS 10.15, *)
public func calcSHA224Hash( _ data: [UInt8] ) -> [UInt8] {
    
    var digest = [UInt8](repeating: 0, count:Int(CC_SHA224_DIGEST_LENGTH))
    
    data.withUnsafeBytes {
        _ = CC_SHA224($0.baseAddress, CC_LONG(data.count), &digest)
    }
    return digest
}

/// This function calculates a SHA256 Hash of the input data
/// @param data: a byte array of data
/// @return: A SHA256 hash of the data
@available(iOS 13, macOS 10.15, *)
public func calcSHA256Hash( _ data: [UInt8] ) -> [UInt8] {
    #if canImport(CryptoKit)
    var sha256 = SHA256()
    sha256.update(data: data)
    let hash = sha256.finalize()
    
    return Array(hash)
    #else
    fatalError("Couldn't import CryptoKit")
    #endif
}

/// This function calculates a SHA512 Hash of the input data
/// @param data: a byte array of data
/// @return: A SHA512 hash of the data
@available(iOS 13, macOS 10.15, *)
public func calcSHA512Hash( _ data: [UInt8] ) -> [UInt8] {
    #if canImport(CryptoKit)
    var sha512 = SHA512()
    sha512.update(data: data)
    let hash = sha512.finalize()
    
    return Array(hash)
    #else
    fatalError("Couldn't import CryptoKit")
    #endif
}

/// This function calculates a SHA384 Hash of the input data
/// @param data: a byte array of data
/// @return: A SHA384 hash of the data
@available(iOS 13, macOS 10.15, *)
public func calcSHA384Hash( _ data: [UInt8] ) -> [UInt8] {
    #if canImport(CryptoKit)
    var sha384 = SHA384()
    sha384.update(data: data)
    let hash = sha384.finalize()
    
    return Array(hash)
    #else
    fatalError("Couldn't import CryptoKit")
    #endif
}

// NEW
public func stringToUInt8(_ string: String) -> [UInt8] {
    let data = string.data(using: .utf8)
    return [UInt8](data!)
}
// NEW
public func UInt8ArrayToHexString( _ val: [UInt8] ) -> String {
    return val.map { String(format: "%02hhx", $0) }.joined().uppercased()
}

// NEW
public func rsaGetFinalE(sig: BigUInt, pubkey: BigUInt) -> BigUInt {
    var finalE = sig
    for _ in 0..<16 {
        finalE = (finalE * finalE) % pubkey
    }
    return finalE
}

// NEW
public func rsaGetSigQuotient(sig: BigUInt, pubkey: BigUInt, finalE: BigUInt) -> BigUInt {
     let dividend = sig * finalE // * precision
     let (quotient, _) = dividend.quotientAndRemainder(dividingBy: pubkey)
     return quotient
 }


// NEW
public func findSequenceIndex(sequence: [UInt8], in data: [UInt8], last: Bool = false) -> Int? {
    var j = 0
    var sequenceIndex: Int? = nil
    for i in 0..<data.count {
        if data[i] == sequence[j] {
            j += 1
            if j == sequence.count {
                sequenceIndex = i - j + 1
                if !last {
                    return i - j + 1
                }
                j = 0
            }
        } else {
            j = 0
        }
    }
    return sequenceIndex
}
