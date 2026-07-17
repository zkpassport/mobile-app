import OpenSSL
import Foundation

@available(iOS 13, macOS 10.15, *)
public enum CertificateType {
    case documentSigningCertificate
    case issuerSigningCertificate
}

@available(iOS 13, macOS 10.15, *)
public enum CertificateItem : String {
    case fingerprint = "Certificate fingerprint"
    case issuerName = "Issuer"
    case subjectName = "Subject"
    case serialNumber = "Serial number"
    case signatureAlgorithm = "Signature algorithm"
    case publicKeyAlgorithm = "Public key algorithm"
    case notBefore = "Valid from"
    case notAfter = "Valid to"
}

@available(iOS 13, macOS 10.15, *)
public class X509Wrapper {
    public let cert : OpaquePointer
    
//    private var pubKey : OpaquePointer?

    public init?( with cert: OpaquePointer? ) {
        guard let cert = cert else { return nil }
        
        self.cert = X509_dup(cert)
    }
    
    public func getItemsAsDict() -> [CertificateItem:String] {
        var item = [CertificateItem:String]()
        if let fingerprint = self.getFingerprint() {
            item[.fingerprint] = fingerprint
        }
        if let issuerName = self.getIssuerName() {
            item[.issuerName] = issuerName
            
        }
        if let subjectName = self.getSubjectName() {
            item[.subjectName] = subjectName
        }
        if let serialNr = self.getSerialNumber() {
            item[.serialNumber] = serialNr
        }
        if let signatureAlgorithm = self.getSignatureAlgorithm() {
            item[.signatureAlgorithm] = signatureAlgorithm
        }
        if let publicKeyAlgorithm = self.getPublicKeyAlgorithm() {
            item[.publicKeyAlgorithm] = publicKeyAlgorithm
        }
        if let notBefore = self.getNotBeforeDate() {
            item[.notBefore] = notBefore
        }
        if let notAfter = self.getNotAfterDate() {
            item[.notAfter] = notAfter
        }
        
        return item
    }
    public func certToPEM() -> String {
        return OpenSSLUtils.X509ToPEM( x509:cert )
    }

    func pemToDer(pemString: String) -> Data? {
        // Remove the PEM header and footer
        let pemHeader = "-----BEGIN CERTIFICATE-----"
        let pemFooter = "-----END CERTIFICATE-----"
        var pem = pemString.replacingOccurrences(of: pemHeader, with: "")
        pem = pem.replacingOccurrences(of: pemFooter, with: "")

        // Remove all newlines and whitespaces
        pem = pem.components(separatedBy: .newlines).joined()
        pem = pem.trimmingCharacters(in: .whitespacesAndNewlines)

        // Decode the Base64 string to Data
        return Data(base64Encoded: pem)
    }

    public func certToDER() -> Data? {
        let pemString = certToPEM()
        return pemToDer(pemString: pemString)

    }
    
    public func getFingerprint( ) -> String? {
        let fdig = EVP_sha1();
        
        var n : UInt32 = 0
        let md = UnsafeMutablePointer<UInt8>.allocate(capacity: Int(EVP_MAX_MD_SIZE))
        defer { md.deinitialize(count: Int(EVP_MAX_MD_SIZE)); md.deallocate() }
        
        X509_digest(cert, fdig, md, &n)
        let arr = UnsafeMutableBufferPointer(start: md, count: Int(n)).map({ binToHexRep($0) }).joined(separator: ":")
        return arr
    }
    
    public func getNotBeforeDate() -> String? {
        var notBefore : String?
        if let val = X509_get0_notBefore(cert) {
            notBefore = ASN1TimeToString( val )
        }
        return notBefore
        
    }
    
    public func getNotAfterDate() -> String? {
        var notAfter : String?
        if let val = X509_get0_notAfter(cert) {
            notAfter = ASN1TimeToString( val )
        }
        return notAfter
    }
    
    public func getSerialNumber() -> String? {
        let serialNr = String( ASN1_INTEGER_get(X509_get_serialNumber(cert)), radix:16, uppercase: true )
        return serialNr
    }
    
    public func getSignatureAlgorithm() -> String? {
        let algor = X509_get0_tbs_sigalg(cert);
        let algo = getAlgorithm( algor?.pointee.algorithm )
        return algo
    }

    public func getSignatureAlgorithmBytes() -> [UInt8]? {
        let algor = X509_get0_tbs_sigalg(cert);
        let data = OBJ_get0_data(algor?.pointee.algorithm)
        let size = OBJ_length(algor?.pointee.algorithm)
        if data != nil && size > 0 {
            return Array(UnsafeBufferPointer(start: data, count: size))
        }
        return nil
    }
    

    // TODO: This is where the public key can be retrieved
//    int X509_PUBKEY_get0_param(ASN1_OBJECT **ppkalg,
//                               const unsigned char **pk, int *ppklen,
//                               X509_ALGOR **pa, X509_PUBKEY *pub);

    public func getPublicKeyAlgorithm() -> String? {
        let pubKey = X509_get_X509_PUBKEY(cert)
        var ptr : OpaquePointer?
        X509_PUBKEY_get0_param(&ptr, nil, nil, nil, pubKey)
        let algo = getAlgorithm(ptr)
        return algo
    }
//
//    public func getPublicKeyFoobar() {
//        if let pubKey = X509_get_X509_PUBKEY(cert) {
//            var algoPtr: OpaquePointer?
//            var keyPtr: UnsafePointer<UInt8>? = nil
//            var keyLen: Int32 = 0
//
//            // Retrieve the algorithm and public key
//            X509_PUBKEY_get0_param(&algoPtr, &keyPtr, &keyLen, nil, pubKey)
//
//            // Get the algorithm name
//            let algoLen = OBJ_obj2nid(algoPtr)
//            var algoString: String? = nil
//            if let sa = OBJ_nid2ln(algoLen) {
//                algoString = String(cString: sa)
//            }
//            print("*** algoString: \(algoString)")
//
//            // Convert the public key bytes to Data
//            if let keyPtr = keyPtr {
////                let keyData = Data(bytes: keyPtr, count: Int(keyLen))
//
//                print("*** Public Key Length: \(Int(keyLen))")
//
//                let keyBytes = Array(UnsafeBufferPointer(start: keyPtr, count: Int(keyLen)))
//                let keyHexString = keyBytes.map { String(format: "%02hhx", $0) }.joined()
//                print("*** Public Key: \(keyHexString)")
//
//            } else {
//                print("*** Unable to retrieve public key")
//            }
//        } else {
//            print("*** Unable to get X509_PUBKEY from certificate")
//        }
//    }

//
//    public func getPublicKeyFoobar() {
//        print("getPublicKeyFoobar()")
//        let pubKey = X509_get_X509_PUBKEY(cert)
//        var algoPtr : OpaquePointer?
////        var foobarPtr : OpaquePointer?
//        var foobarPtr: UnsafePointer<UInt8>?
//        X509_PUBKEY_get0_param(&algoPtr, &foobarPtr, nil, nil, pubKey)
//
//
////        let foobarLen = OBJ_obj2nid(foobarPtr)
////        var foobarString : String? = nil
////        if let sa = OBJ_nid2ln(foobarLen) {
////            algoString = String(cString: sa)
////        }
//
//        let algoLen = OBJ_obj2nid(algoPtr)
//        var algoString : String? = nil
//        if let sa = OBJ_nid2ln(algoLen) {
//            algoString = String(cString: sa)
//        }
//
//
//        print("*** algoString: \(algoString)")
//    }
    
    public func getIssuerName() -> String? {
        return getName(for: X509_get_issuer_name(cert))
    }
    
    public func getSubjectName() -> String? {
        return getName(for: X509_get_subject_name(cert))
    }
    
    private func getName( for name: OpaquePointer? ) -> String? {
        guard let name = name else { return nil }
        
        var issuer: String = ""
        
        guard let out = BIO_new( BIO_s_mem()) else { return nil }
        defer { BIO_free(out) }
        
        X509_NAME_print_ex(out, name, 0, UInt(ASN1_STRFLGS_ESC_2253 |
                                                ASN1_STRFLGS_ESC_CTRL |
                                                ASN1_STRFLGS_ESC_MSB |
                                                ASN1_STRFLGS_UTF8_CONVERT |
                                                ASN1_STRFLGS_DUMP_UNKNOWN |
                                                ASN1_STRFLGS_DUMP_DER | XN_FLAG_SEP_COMMA_PLUS |
                                                XN_FLAG_DN_REV |
                                                XN_FLAG_FN_SN |
                                                XN_FLAG_DUMP_UNKNOWN_FIELDS))
        issuer = OpenSSLUtils.bioToString(bio: out)
        
        return issuer
    }
    
    private func getAlgorithm( _ algo:  OpaquePointer? ) -> String? {
        guard let algo = algo else { return nil }
        let len = OBJ_obj2nid(algo)
        var algoString : String? = nil
        if let sa = OBJ_nid2ln(len) {
            algoString = String(cString: sa )
        }
        return algoString
    }
    
    private func ASN1TimeToString( _ date: UnsafePointer<ASN1_TIME> ) -> String? {
        guard let b = BIO_new(BIO_s_mem()) else { return nil }
        defer { BIO_free(b) }
        
        ASN1_TIME_print(b, date)
        return OpenSSLUtils.bioToString(bio: b)
    }
    


//    public func foobarGetPublicKey() throws -> OpaquePointer {
//        if let key = pubKey {
//            return key
//        }
//        if let key = X509_get_pubkey(cert) {
//            pubKey = key
//            return key
//        }
//        // TODO: Change error type
//        throw OpenSSLError.UnableToExtractSignedDataFromPKCS7("Unable to get public key")
//    }

   public func getSignature() -> [UInt8]? {
        var sig: UnsafePointer<ASN1_BIT_STRING>?
        
        X509_get0_signature(&sig, nil, cert)
        
        let sigData = sig?.pointee.data
        let sigLen = Int(sig?.pointee.length ?? 0)
        if sigData != nil && sigLen > 0 {
            return Array(UnsafeBufferPointer(start: sigData, count: sigLen))
        }
        return nil
    }

    public func getTBSCertificate() -> [UInt8]? {
        let pemCert: String = certToPEM()

        let base64Cert = pemCert
            .replacingOccurrences(of: "-----END CERTIFICATE-----", with: "")
            .replacingOccurrences(of: "-----BEGIN CERTIFICATE-----", with: "")
            .replacingOccurrences(of: "\n", with: "")
        
        // We get the signature algorithm bytes that appears right after the end
        // of the tbs certificate so we know where it ends
        // c.f. https://datatracker.ietf.org/doc/html/rfc3280#section-4.1
        let signatureAlgorithmBytes: [UInt8] = getSignatureAlgorithmBytes()!
        // Get the bytes of the entire certificate
        let certBytes = Array([UInt8](Data(base64Encoded: base64Cert)!))
        // Find the index of the of signature algorithm in the whole certificate
        // so we can extract only the TBS (to be signed) certificate
        // We look for the last occurrence as the signature algorithm appears twice
        // in the tbs certificate and right after it
        guard let indexOfCertSequence = findSequenceIndex(sequence: signatureAlgorithmBytes, in: certBytes, last: true) else {
            return nil
        }
        
        // The last 4 elements are the preceding tag and length info for the signature algorithm
        // and the first 4 elements are the preceding tag and length info for the tbs certificate
        // so we take both of them out
        let tbsCert = certBytes[4..<(indexOfCertSequence - 4)]
        
        if tbsCert.count > 0 {
            return Array(tbsCert)
        }
        return nil
    }
}
