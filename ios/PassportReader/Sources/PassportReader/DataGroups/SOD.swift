import Foundation
import OpenSSL
import BigInt

// Format of SOD: ASN1 - Signed Data  (taken from rfc5652 - https://tools.ietf.org/html/rfc5652):
// The SOD is a CMS container of type Signed-data
//
// Note - ideally I'd be using a proper ASN1 parser, however currently there isn't a reliable one for Swift
// and I haven't written on (yet?).  So for the moment, I'm relying on the output from ASN1Dump and a
// simple parser for that
//
// Sequence
//   Object ID: signedData
//   Content: SignedData
//       SignedData ::= SEQUENCE {
//           INTEGER version CMSVersion,
//           SET digestAlgorithms DigestAlgorithmIdentifiers,
//           SEQUENCE encapContentInfo EncapsulatedContentInfo,
//           certificates [0] IMPLICIT CertificateSet OPTIONAL,
//           crls [1] IMPLICIT RevocationInfoChoices OPTIONAL,
//           SET signerInfos SignerInfos }
//
// AlgorithmIdentifier ::= SEQUENCE {
//     algorithm       OBJECT IDENTIFIER,
//     parameters      ANY OPTIONAL
// }
//
// EncapsulatedContentInfo ::= SEQUENCE {
//    eContentType ContentType,
//    eContent [0] EXPLICIT OCTET STRING OPTIONAL }
//
// ContentType ::= OBJECT IDENTIFIER
//
// SignerInfos ::= SET OF SignerInfo
//
// SignerInfo ::= SEQUENCE {
//     version CMSVersion,
//     sid SignerIdentifier,
//     digestAlgorithm DigestAlgorithmIdentifier,
//     signedAttrs [0] IMPLICIT SignedAttributes OPTIONAL,
//     signatureAlgorithm SignatureAlgorithmIdentifier,
//     signature SignatureValue,
//     unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL }
//
// SignerIdentifier ::= CHOICE {
//     issuerAndSerialNumber IssuerAndSerialNumber,
//     subjectKeyIdentifier [0] SubjectKeyIdentifier }
//
// SignedAttributes ::= SET SIZE (1..MAX) OF Attribute
// UnsignedAttributes ::= SET SIZE (1..MAX) OF Attribute
// Attribute ::= SEQUENCE {
//     attrType OBJECT IDENTIFIER,
//     attrValues SET OF AttributeValue }
// AttributeValue ::= ANY
// SignatureValue ::= OCTET STRING

// @available(iOS 13, macOS 10.15, *)
public class SOD : DataGroup {
    
    public private(set) var pkcs7CertificateData : [UInt8] = []
    private var asn1: ASN1Item!
    private var pubKey: OpaquePointer?
    private var signature: Data?
    private var encapsulatedContent: Data?
    private var encapsulatedContentDigestAlgorithm: String?
    private var signedAttrHashAlgorithm: String?
    private var cmsVersion: String?

    required init( _ data : [UInt8] ) throws {
        try super.init(data)
        self.pkcs7CertificateData = body
        datagroupType = .SOD
    }
    
    deinit {
        if ( pubKey != nil ) {
            EVP_PKEY_free(pubKey);
        }
    }

    override func parse(_ data: [UInt8]) throws {
         let p = SimpleASN1DumpParser()
         asn1 = try p.parse(data: Data(body))
    }

//    public func getPublicKeyBinary2() throws -> [UInt8] {
//        guard let key = try? getPublicKey() else {
//            throw PassportReaderError.UnableToExtractPubKeyFromSOD
//        }
//        
//        guard let pubKeyUInt8Array = OpenSSLUtils.publicKeyToUInt8Array(pubKey: key),
//              let asn1Child = try SimpleASN1DumpParser().parse(data: Data(pubKeyUInt8Array)).getChild(0) else {
//            throw PassportReaderError.UnableToExtractPubKeyFromSOD
//        }
//        
//        let pubKeyModulus = hexRepToBin(asn1Child.value)
//        return pubKeyModulus
//    }

    
    public func getRSAPublicKeyBinary() throws -> [UInt8] {
        if let key = try? getPublicKey() {
            guard let pubKeyUInt8Array = OpenSSLUtils.rsaPublicKeyToUInt8Array(pubKey: key) else {
                throw PassportReaderError.UnableToExtractPubKeyFromSOD
            }
            asn1 = try SimpleASN1DumpParser().parse(data: Data(pubKeyUInt8Array))
            let pubKeyModulus = hexRepToBin(asn1.getChild(0)!.value)
            return pubKeyModulus
        } else {
            throw PassportReaderError.UnableToExtractPubKeyFromSOD
        }
    }

//    public func getSigFinalE() throws -> [UInt8] {
//        let sod_sig = try! getSignature()
//        let sod_pubkey: [UInt8] = try! getPublicKeyBinary()
//        let sod_final_e = rsaGetFinalE(sig: BigUInt(sod_sig), pubkey: BigUInt(Data(sod_pubkey)))
//        return [UInt8](sod_final_e.serialize())
//    }

//    public func getSigQuotient() throws -> [UInt8] {
//        let sod_sig = try! getSignature()
//        let sod_pubkey: [UInt8] = try! getPublicKeyBinary()
//        let sod_final_e = rsaGetFinalE(sig: BigUInt(Data(sod_sig)), pubkey: BigUInt(Data(sod_pubkey)))
//        
//        let sod_sig_quotient =  GetSigQuotient(sig: BigUInt(sod_sig), pubkey: BigUInt(Data(sod_pubkey)), finalE: sod_final_e)
//        return [UInt8](sod_sig_quotient.serialize())
//        // print("*** sod_sig_quotient", sod_sig_quotient)
//        // return []
//    }
    
    /// Returns the public key from the embedded X509 certificate
    /// - Returns pointer to the public key
    public func getPublicKey() throws -> OpaquePointer {
        if let key = pubKey {
            return key
        }
        if let certs = try? OpenSSLUtils.getX509CertificatesFromPKCS7(pkcs7Der: Data(pkcs7CertificateData)) {
            for cert in certs {
//                cert.getPublicKeyFoobar()
//                let foo = cert.getItemsAsDict()
//                print("foo.description: \(foo.description)")
                if let key = X509_get_pubkey(cert.cert) {
                    pubKey = key
                    return key
                }

            }
        }
        // TODO: Loop through all possible (TBS) certs looking for public key of DSC that'll be in the TBS
//        print("certs count: \(certs.count)")
//        if let key = X509_get_pubkey (certs[0].cert) {
//            pubKey = key
//            return key
//        }
        throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Unable to get public key")
    }


    /// Extracts the encapsulated content section from a SignedData PKCS7 container (if present)
    /// - Returns: The encapsulated content from a PKCS7 container if we could read it
    /// - Throws: Error if we can't find or read the encapsulated content
    public func getEncapsulatedContent() throws -> Data {
        if self.encapsulatedContent != nil { return self.encapsulatedContent! }
        
         guard let signedData = asn1.getChild(1)?.getChild(0),
               let encContent = signedData.getChild(2)?.getChild(1),
               let content = encContent.getChild(0) else {
            
             throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
         }
        
         var sigData : Data?
         if content.type.hasPrefix("OCTET STRING" ) {
             sigData = Data(hexRepToBin( content.value ))
         }
        
         guard let ret = sigData else { throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("noDataReturned") }
         self.encapsulatedContent = ret
         return ret
    }
    
    /// Gets the CMS version in the signed data section (if present)
    /// - Returns: The CMS version in the signed data section
    /// - Throws: Error if we can't find or read the CMS version
    public func getCMSVersion() throws -> String {
        if self.cmsVersion != nil { return self.cmsVersion! }

        guard let signedData = asn1.getChild(1)?.getChild(0),
              let cmsVersion = signedData.getChild(0) else {
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        if let intValue = Int(cmsVersion.value) {
            self.cmsVersion = String(intValue)
        } else {
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        return self.cmsVersion!
    }
          
    /// Gets the digest algorithm used to hash the encapsulated content in the signed data section (if present)
    /// - Returns: The digest algorithm used to hash the encapsulated content in the signed data section
    /// - Throws: Error if we can't find or read the digest algorithm
    public func getEncapsulatedContentDigestAlgorithm() throws -> String {
        if self.encapsulatedContentDigestAlgorithm != nil { return self.encapsulatedContentDigestAlgorithm! }
        
        guard let signedData = asn1.getChild(1)?.getChild(0),
              let digestAlgo = signedData.getChild(1)?.getChild(0)?.getChild(0) else {
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        self.encapsulatedContentDigestAlgorithm = String(digestAlgo.value)
        return self.encapsulatedContentDigestAlgorithm!
    }
        
    /// Gets the digest algorithm used to hash the signed attributes in the signed data section (if present)
    /// - Returns: The digest algorithm used to hash the signed attributes in the signed data section
    /// - Throws: Error if we can't find or read the digest algorithm
    public func getSignedAttrHashAlgorithm() throws -> String {
        if self.signedAttrHashAlgorithm != nil { return self.signedAttrHashAlgorithm! }

        // Get the SignedAttributes section.
        guard let signedData = asn1.getChild(1)?.getChild(0),
              let signerInfo = signedData.getChild(4)?.getChild(0),
              let digestAlgorithm = signerInfo.getChild(2)?.getChild(0) else {
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }

        self.signedAttrHashAlgorithm = String(digestAlgorithm.value)
        return self.signedAttrHashAlgorithm!
    }
    
    /// Gets the signed attributes section (if present)
    /// - Returns: the signed attributes section
    /// - Throws: Error if we can't find or read the signed attributes
    public func getSignedAttributes() throws -> Data {
        
        // Get the SignedAttributes section.
        guard let signedData = asn1.getChild(1)?.getChild(0),
              let signerInfo = signedData.getChild(4),
              let signedAttrs = signerInfo.getChild(0)?.getChild(3) else {
            
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        
        var bytes = [UInt8](self.pkcs7CertificateData[signedAttrs.pos ..< signedAttrs.pos + signedAttrs.headerLen + signedAttrs.length])
        
        // The first byte will be 0xA0 -> as its a explicit tag for a contextual item which we need to convert
        // for the hash to calculate correctly
        // We know that the actual tag is a SET (0x31) - See section 5.4 of https://tools.ietf.org/html/rfc5652
        // So we need to change this from 0xA0 to 0x31
        if bytes[0] == 0xA0 {
            bytes[0] = 0x31
        }
        let signedAttribs = Data(bytes)
        
        return signedAttribs
    }
    
/// Gets the message digest from the signed attributes section (if present)
/// - Returns: the message digest
/// - Throws: Error if we can't find or read the message digest
    func getMessageDigestFromSignedAttributes() throws -> Data {
        
        // For the SOD, the SignedAttributes consists of:
        // A Content type Object (which has the value of the attributes content type)
        // A messageDigest Object which has the message digest as it value
        // We want the messageDigest value
        
        guard let signedData = asn1.getChild(1)?.getChild(0),
              let signerInfo = signedData.getChild(4),
              let signedAttrs = signerInfo.getChild(0)?.getChild(3) else {
            
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        
        // Find the messageDigest in the signedAttributes section
        var sigData : Data?
        for i in 0 ..< signedAttrs.getNumberOfChildren() {
            let attrObj = signedAttrs.getChild(i)
            if attrObj?.getChild(0)?.value == "messageDigest" {
                if let set = attrObj?.getChild(1),
                   let digestVal = set.getChild(0) {
                    
                    if digestVal.type.hasPrefix("OCTET STRING" ) {
                        sigData = Data(hexRepToBin( digestVal.value ) )
                    }
                }
            }
        }
        
        guard let messageDigest = sigData else { throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("No messageDigest Returned") }
        
        return messageDigest
    }
    
    public func getSignedAttributesHash() throws -> Data {
        
        // throw PassportReaderError.NotImplemented
        let sigType = try getSignatureAlgorithm().lowercased()
        
        var digest = "sha256"
        if sigType.contains( "sha1" ) {
            digest = "sha1"
        } else if sigType.contains( "sha224" ) {
            digest = "sha224"
        } else if sigType.contains( "sha256" ) || sigType.contains( "rsassapss" ) {
            digest = "sha256"
        } else if sigType.contains( "sha384" ) {
            digest = "sha384"
        } else if sigType.contains( "sha512" ) {
            digest = "sha512"
        }
        
        let signedAttributes = try getSignedAttributes()
        // let signedAttribsHashAlgo = try getEncapsulatedContentDigestAlgorithm()
        let hash: Data = try Data(calcHash(data: [UInt8](signedAttributes), hashAlgorithm: digest))
        
        return hash
    }

    // Have a good guess at the hashing algorithm used for the signature
    public func getSigHashingAlg() throws -> String {
        let sigAlg = try getSignatureAlgorithm().lowercased()
        var hashingAlg = "sha256"
        if sigAlg.contains("sha1") {
            hashingAlg = "sha1"
        } else if sigAlg.contains("sha224") {
            hashingAlg = "sha224"
        } else if sigAlg.contains("sha256") || sigAlg.contains("rsassapss") {
            hashingAlg = "sha256"
        } else if sigAlg.contains("sha384") {
            hashingAlg = "sha384"
        } else if sigAlg.contains("sha512") {
            hashingAlg = "sha512"
        }
        return hashingAlg
    }

    /// Gets the signature data (if present)
    /// - Returns: the signature
    /// - Throws: Error if we can't find or read the signature
    public func getSignature() throws -> Data {
        if self.signature != nil { return self.signature! }
        
        guard let signedData = asn1.getChild(1)?.getChild(0),
              let signerInfo = signedData.getChild(4),
              let signature = signerInfo.getChild(0)?.getChild(5) else {
            
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        
        var sigData : Data?
        if signature.type.hasPrefix("OCTET STRING" ) {
            sigData = Data(hexRepToBin( signature.value ))
        }
        
        guard let ret = sigData else { throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("noDataReturned") }
        self.signature = ret
        return ret
    }
    
    /// Gets the signature algorithm used (if present)
    /// - Returns: the signature algorithm used
    /// - Throws: Error if we can't find or read the signature algorithm
    public func getSignatureAlgorithm() throws -> String {
        
        guard let signedData = asn1.getChild(1)?.getChild(0),
              let signerInfo = signedData.getChild(4),
              let signatureAlgo = signerInfo.getChild(0)?.getChild(4)?.getChild(0) else {
            
            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
        }
        
        // Vals I've seen are:
        // sha1WithRSAEncryption => default pkcs1
        // sha256WithRSAEncryption => default pkcs1
        // rsassaPss => pss
        return signatureAlgo.value
    }
    
//    func decryptedSignature() -> String {
//        let getSig = try! getSignature()
//        let getPubKey = Data(try! getPublicKeyBinary())
//        
//        let signature = BigUInt(getSig)
//        let pubkey = BigUInt(getPubKey)
//        let e = BigUInt(2).power(16) + BigUInt(2).power(0)
//
//        let decrypted = signature.power(e, modulus: pubkey)
//        
//        let hexStr = UInt8ArrayToHexString([UInt8](decrypted.serialize()))
//        return hexStr
//    }
}


//import Foundation
//import OpenSSL
//import BigInt
//
//// Format of SOD: ASN1 - Signed Data  (taken from rfc5652 - https://tools.ietf.org/html/rfc5652):
//// The SOD is a CMS container of type Signed-data
////
//// Note - ideally I'd be using a proper ASN1 parser, however currently there isn't a reliable one for Swift
//// and I haven't written on (yet?).  So for the moment, I'm relying on the output from ASN1Dump and a
//// simple parser for that
////
//// Sequence
////   Object ID: signedData
////   Content: SignedData
////       SignedData ::= SEQUENCE {
////           INTEGER version CMSVersion,
////           SET digestAlgorithms DigestAlgorithmIdentifiers,
////           SEQUENCE encapContentInfo EncapsulatedContentInfo,
////           certificates [0] IMPLICIT CertificateSet OPTIONAL,
////           crls [1] IMPLICIT RevocationInfoChoices OPTIONAL,
////           SET signerInfos SignerInfos }
////
//// AlgorithmIdentifier ::= SEQUENCE {
////     algorithm       OBJECT IDENTIFIER,
////     parameters      ANY OPTIONAL
//// }
////
//// EncapsulatedContentInfo ::= SEQUENCE {
////    eContentType ContentType,
////    eContent [0] EXPLICIT OCTET STRING OPTIONAL }
////
//// ContentType ::= OBJECT IDENTIFIER
////
//// SignerInfos ::= SET OF SignerInfo
////
//// SignerInfo ::= SEQUENCE {
////     version CMSVersion,
////     sid SignerIdentifier,
////     digestAlgorithm DigestAlgorithmIdentifier,
////     signedAttrs [0] IMPLICIT SignedAttributes OPTIONAL,
////     signatureAlgorithm SignatureAlgorithmIdentifier,
////     signature SignatureValue,
////     unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL }
////
//// SignerIdentifier ::= CHOICE {
////     issuerAndSerialNumber IssuerAndSerialNumber,
////     subjectKeyIdentifier [0] SubjectKeyIdentifier }
////
//// SignedAttributes ::= SET SIZE (1..MAX) OF Attribute
//// UnsignedAttributes ::= SET SIZE (1..MAX) OF Attribute
//// Attribute ::= SEQUENCE {
////     attrType OBJECT IDENTIFIER,
////     attrValues SET OF AttributeValue }
//// AttributeValue ::= ANY
//// SignatureValue ::= OCTET STRING
//@available(iOS 13, macOS 10.15, *)
//public class SOD : DataGroup {
//    
//    public private(set) var pkcs7CertificateData : [UInt8] = []
//    private var asn1 : ASN1Item!
//    private var pubKey : OpaquePointer?
//    
//    public required init( _ data : [UInt8] ) throws {
//        try super.init(data)
//        self.pkcs7CertificateData = body
//        datagroupType = .SOD
//    }
//    
//    deinit {
//        if ( pubKey != nil ) {
//            EVP_PKEY_free(pubKey);
//        }
//    }
//
//    override func parse(_ data: [UInt8]) throws {
//        let p = SimpleASN1DumpParser()
//        asn1 = try p.parse(data: Data(body))
//    }
//    
//    public func getPublicKeyBinary() throws -> [UInt8] {
//        if let key = try? getPublicKey() {
//            let pubKeyUInt8Array = OpenSSLUtils.publicKeyToUInt8Array(pubKey: key)
//            asn1 = try SimpleASN1DumpParser().parse(data: Data(pubKeyUInt8Array!))
//            let pubKeyModulus = hexRepToBin(asn1.getChild(0)!.value)
//            return pubKeyModulus
//        } else {
//            throw PassportReaderError.UnableToExtractPubKeyFromSOD
//        }
//    }
//    
//    public func getSigFinalE() throws -> [UInt8] {
//        let sod_sig = try! getSignature()
//        let sod_pubkey: [UInt8] = try! getPublicKeyBinary()
//        let sod_final_e = rsaGetFinalE(sig: BigUInt(sod_sig), pubkey: BigUInt(Data(sod_pubkey)))
//        return [UInt8](sod_final_e.serialize())
//    }
//
//    public func getSigQuotient() throws -> [UInt8] {
//        let sod_sig = try! getSignature()
//        let sod_pubkey: [UInt8] = try! getPublicKeyBinary()
//        let sod_final_e = rsaGetFinalE(sig: BigUInt(Data(sod_sig)), pubkey: BigUInt(Data(sod_pubkey)))
//        
//        let sod_sig_quotient = rsaGetSigQuotient(sig: BigUInt(sod_sig), pubkey: BigUInt(Data(sod_pubkey)), finalE: sod_final_e)
//        return [UInt8](sod_sig_quotient.serialize())
//        // print("*** sod_sig_quotient", sod_sig_quotient)
//        // return []
//    }
//    
//    /// Returns the public key from the embedded X509 certificate
//    /// - Returns pointer to the public key
//    func getPublicKey( ) throws -> OpaquePointer {
//        
//        if let key = pubKey {
//            return key
//        }
//        
//        let certs = try OpenSSLUtils.getX509CertificatesFromPKCS7(pkcs7Der:Data(pkcs7CertificateData))
//        if let key = X509_get_pubkey (certs[0].cert) {
//            pubKey = key
//            return key
//        }
//        
//        throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Unable to get public key")
//    }
//    
//    
//    /// Extracts the encapsulated content section from a SignedData PKCS7 container (if present)
//    /// - Returns: The encapsulated content from a PKCS7 container if we could read it
//    /// - Throws: Error if we can't find or read the encapsulated content
//    public func getEncapsulatedContent() throws -> Data {
//        guard let signedData = asn1.getChild(1)?.getChild(0),
//              let encContent = signedData.getChild(2)?.getChild(1),
//              let content = encContent.getChild(0) else {
//            
//            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
//        }
//        
//        var sigData : Data?
//        if content.type.hasPrefix("OCTET STRING" ) {
//            sigData = Data(hexRepToBin( content.value ))
//        }
//        
//        guard let ret = sigData else { throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("noDataReturned") }
//        return ret
//    }
//    
//    /// Gets the digest algorithm used to hash the encapsulated content in the signed data section (if present)
//    /// - Returns: The digest algorithm used to hash the encapsulated content in the signed data section
//    /// - Throws: Error if we can't find or read the digest algorithm
//    public func getEncapsulatedContentDigestAlgorithm() throws -> String {
//        guard let signedData = asn1.getChild(1)?.getChild(0),
//              let digestAlgo = signedData.getChild(1)?.getChild(0)?.getChild(0) else {
//            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
//        }
//        
//        return String(digestAlgo.value)
//    }
//    
//    /// Gets the signed attributes section (if present)
//    /// - Returns: the signed attributes section
//    /// - Throws: Error if we can't find or read the signed attributes
//    public func getSignedAttributes( ) throws -> Data {
//        
//        // Get the SignedAttributes section.
//        guard let signedData = asn1.getChild(1)?.getChild(0),
//              let signerInfo = signedData.getChild(4),
//              let signedAttrs = signerInfo.getChild(0)?.getChild(3) else {
//            
//            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
//        }
//        
//        var bytes = [UInt8](self.pkcs7CertificateData[signedAttrs.pos ..< signedAttrs.pos + signedAttrs.headerLen + signedAttrs.length])
//        
//        // The first byte will be 0xA0 -> as its a explicit tag for a contextual item which we need to convert
//        // for the hash to calculate correctly
//        // We know that the actual tag is a SET (0x31) - See section 5.4 of https://tools.ietf.org/html/rfc5652
//        // So we need to change this from 0xA0 to 0x31
//        if bytes[0] == 0xA0 {
//            bytes[0] = 0x31
//        }
//        let signedAttribs = Data(bytes)
//        
//        return signedAttribs
//    }
//    
//    public func getSignedAttributesHash() throws -> Data {
//        
//        // throw PassportReaderError.NotImplemented
//        let sigType = try getSignatureAlgorithm().lowercased()
//        
//        var digest = "sha256"
//        if sigType.contains( "sha1" ) {
//            digest = "sha1"
//        } else if sigType.contains( "sha224" ) {
//            digest = "sha224"
//        } else if sigType.contains( "sha256" ) || sigType.contains( "rsassapss" ) {
//            digest = "sha256"
//        } else if sigType.contains( "sha384" ) {
//            digest = "sha384"
//        } else if sigType.contains( "sha512" ) {
//            digest = "sha512"
//        }
//        
//        let signedAttributes = try getSignedAttributes()
//        // let signedAttribsHashAlgo = try getEncapsulatedContentDigestAlgorithm()
//        let hash: Data = try Data(calcHash(data: [UInt8](signedAttributes), hashAlgorithm: digest))
//        
//        return hash
//    }
//    
//    
///// Gets the message digest from the signed attributes section (if present)
///// - Returns: the message digest
///// - Throws: Error if we can't find or read the message digest
//    func getMessageDigestFromSignedAttributes( ) throws -> Data {
//        
//        // For the SOD, the SignedAttributes consists of:
//        // A Content type Object (which has the value of the attributes content type)
//        // A messageDigest Object which has the message digest as it value
//        // We want the messageDigest value
//        
//        guard let signedData = asn1.getChild(1)?.getChild(0),
//              let signerInfo = signedData.getChild(4),
//              let signedAttrs = signerInfo.getChild(0)?.getChild(3) else {
//            
//            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
//        }
//        
//        // Find the messageDigest in the signedAttributes section
//        var sigData : Data?
//        for i in 0 ..< signedAttrs.getNumberOfChildren() {
//            let attrObj = signedAttrs.getChild(i)
//            if attrObj?.getChild(0)?.value == "messageDigest" {
//                if let set = attrObj?.getChild(1),
//                   let digestVal = set.getChild(0) {
//                    
//                    if digestVal.type.hasPrefix("OCTET STRING" ) {
//                        sigData = Data(hexRepToBin( digestVal.value ) )
//                    }
//                }
//            }
//        }
//        
//        guard let messageDigest = sigData else { throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("No messageDigest Returned") }
//        
//        return messageDigest
//    }
//    
//    /// Gets the signature data (if present)
//    /// - Returns: the signature
//    /// - Throws: Error if we can't find or read the signature
//    public func getSignature( ) throws -> Data {
//        
//        guard let signedData = asn1.getChild(1)?.getChild(0),
//              let signerInfo = signedData.getChild(4),
//              let signature = signerInfo.getChild(0)?.getChild(5) else {
//            
//            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
//        }
//        
//        var sigData : Data?
//        if signature.type.hasPrefix("OCTET STRING" ) {
//            sigData = Data(hexRepToBin( signature.value ))
//        }
//        
//        guard let ret = sigData else { throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("noDataReturned") }
//        return ret
//    }
//    
//    /// Gets the signature algorithm used (if present)
//    /// - Returns: the signature algorithm used
//    /// - Throws: Error if we can't find or read the signature algorithm
//    public func getSignatureAlgorithm( ) throws -> String {
//        
//        guard let signedData = asn1.getChild(1)?.getChild(0),
//              let signerInfo = signedData.getChild(4),
//              let signatureAlgo = signerInfo.getChild(0)?.getChild(4)?.getChild(0) else {
//            
//            throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Data in invalid format")
//        }
//        
//        // Vals I've seen are:
//        // sha1WithRSAEncryption => default pkcs1
//        // sha256WithRSAEncryption => default pkcs1
//        // rsassaPss => pss        
//        return signatureAlgo.value
//    }
//}
