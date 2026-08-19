import Foundation
import Security

struct BridgeError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func fail(_ message: String) -> Never {
    fputs(message + "\n", stderr)
    exit(20)
}

func jsonEscape(_ value: String) -> String {
    var out = ""
    for scalar in value.unicodeScalars {
        switch scalar.value {
        case 0x22: out += "\\\""
        case 0x5c: out += "\\\\"
        case 0x08: out += "\\b"
        case 0x0c: out += "\\f"
        case 0x0a: out += "\\n"
        case 0x0d: out += "\\r"
        case 0x09: out += "\\t"
        case 0x00...0x1f: out += String(format: "\\u%04x", scalar.value)
        default: out.unicodeScalars.append(scalar)
        }
    }
    return out
}

func b64url(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}

func tagFor(_ name: String) throws -> Data {
    guard !name.isEmpty && name.utf8.count <= 200 else { throw BridgeError("invalid key name") }
    guard name.unicodeScalars.allSatisfy({ scalar in
        let v = scalar.value
        return (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122) || v == 45 || v == 46 || v == 95
    }) else { throw BridgeError("invalid key name") }
    return Data(("com.cieav.hardware." + name).utf8)
}

func secureEnclaveAttributes(_ key: SecKey) throws {
    guard let attrs = SecKeyCopyAttributes(key) as? [CFString: Any], let token = attrs[kSecAttrTokenID] else { throw BridgeError("secure enclave key attributes unavailable") }
    guard String(describing: token) == String(describing: kSecAttrTokenIDSecureEnclave) else { throw BridgeError("key is not Secure Enclave backed") }
    var exportError: Unmanaged<CFError>?
    if SecKeyCopyExternalRepresentation(key, &exportError) != nil { throw BridgeError("secure enclave private key unexpectedly exportable") }
}

func lookupPrivateKey(_ name: String) throws -> SecKey {
    let tag = try tagFor(name)
    let query: [CFString: Any] = [
        kSecClass: kSecClassKey,
        kSecAttrApplicationTag: tag,
        kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
        kSecReturnRef: true,
        kSecMatchLimit: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let key = item as! SecKey? else { throw BridgeError("secure enclave key not found: \(status)") }
    try secureEnclaveAttributes(key)
    return key
}

func publicJwk(_ privateKey: SecKey) throws -> String {
    guard let publicKey = SecKeyCopyPublicKey(privateKey) else { throw BridgeError("public key unavailable") }
    var error: Unmanaged<CFError>?
    guard let raw = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else { throw BridgeError("public key export failed") }
    guard raw.count == 65 && raw[raw.startIndex] == 0x04 else { throw BridgeError("unexpected P-256 public key encoding") }
    let x = raw.subdata(in: 1..<33), y = raw.subdata(in: 33..<65)
    return "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"\(b64url(x))\",\"y\":\"\(b64url(y))\"}"
}

func createP256(_ name: String) throws -> SecKey {
    let tag = try tagFor(name)
    let existingQuery: [CFString: Any] = [kSecClass: kSecClassKey, kSecAttrApplicationTag: tag, kSecReturnRef: true, kSecMatchLimit: kSecMatchLimitOne]
    var existing: CFTypeRef?
    if SecItemCopyMatching(existingQuery as CFDictionary, &existing) == errSecSuccess { throw BridgeError("key already exists") }
    var accessError: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, [.privateKeyUsage], &accessError) else { throw BridgeError("access control creation failed") }
    let attrs: [CFString: Any] = [
        kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits: 256,
        kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs: [
            kSecAttrIsPermanent: true,
            kSecAttrApplicationTag: tag,
            kSecAttrAccessControl: access
        ] as CFDictionary
    ]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attrs as CFDictionary, &error) else { throw BridgeError("Secure Enclave key creation failed") }
    try secureEnclaveAttributes(key)
    return key
}

func probe() -> Int32 {
    var accessError: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, [.privateKeyUsage], &accessError) else {
        print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"provider\":\"SECURE_ENCLAVE\",\"available\":false,\"hardwareBacked\":false,\"reason\":\"access control unavailable\"}")
        return 20
    }
    let attrs: [CFString: Any] = [kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256, kSecAttrTokenID: kSecAttrTokenIDSecureEnclave, kSecPrivateKeyAttrs: [kSecAttrIsPermanent: false, kSecAttrAccessControl: access] as CFDictionary]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attrs as CFDictionary, &error) else {
        print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"provider\":\"SECURE_ENCLAVE\",\"available\":false,\"hardwareBacked\":false,\"reason\":\"Secure Enclave unavailable\"}")
        return 20
    }
    do { try secureEnclaveAttributes(key) } catch {
        print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"provider\":\"SECURE_ENCLAVE\",\"available\":false,\"hardwareBacked\":false,\"reason\":\"hardware invariant failed\"}")
        return 20
    }
    print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"provider\":\"SECURE_ENCLAVE\",\"nativeProvider\":\"Security.framework Secure Enclave\",\"available\":true,\"hardwareBacked\":true}")
    return 0
}

func hexDecode(_ value: String) throws -> Data {
    guard value.count == 64 else { throw BridgeError("sign-es256 requires a 32-byte SHA-256 digest") }
    var out = Data(); out.reserveCapacity(32)
    var index = value.startIndex
    for _ in 0..<32 {
        let next = value.index(index, offsetBy: 2)
        guard let byte = UInt8(value[index..<next], radix: 16) else { throw BridgeError("invalid digest hex") }
        out.append(byte); index = next
    }
    return out
}

func fixed32(_ bytes: Data) throws -> Data {
    var value = bytes
    while value.count > 32 && value.first == 0 { value.removeFirst() }
    guard value.count <= 32 else { throw BridgeError("ECDSA integer too large") }
    if value.count < 32 { value = Data(repeating: 0, count: 32 - value.count) + value }
    return value
}

func derToP1363(_ der: Data) throws -> Data {
    let b = [UInt8](der); var i = 0
    func take() throws -> UInt8 { guard i < b.count else { throw BridgeError("invalid ECDSA DER") }; defer { i += 1 }; return b[i] }
    guard try take() == 0x30 else { throw BridgeError("invalid ECDSA DER sequence") }
    let sequenceLength = Int(try take()); guard sequenceLength == b.count - 2 else { throw BridgeError("unsupported ECDSA DER length") }
    guard try take() == 0x02 else { throw BridgeError("invalid ECDSA r") }; let rLen = Int(try take()); guard i + rLen <= b.count else { throw BridgeError("invalid ECDSA r length") }; let r = Data(b[i..<i+rLen]); i += rLen
    guard try take() == 0x02 else { throw BridgeError("invalid ECDSA s") }; let sLen = Int(try take()); guard i + sLen == b.count else { throw BridgeError("invalid ECDSA s length") }; let s = Data(b[i..<i+sLen])
    return try fixed32(r) + fixed32(s)
}

func signEs256(_ name: String, _ digestHex: String) throws -> String {
    let key = try lookupPrivateKey(name), digest = try hexDecode(digestHex)
    guard SecKeyIsAlgorithmSupported(key, .sign, .ecdsaSignatureDigestX962SHA256) else { throw BridgeError("Secure Enclave key does not support ES256 digest signing") }
    var error: Unmanaged<CFError>?
    guard let der = SecKeyCreateSignature(key, .ecdsaSignatureDigestX962SHA256, digest as CFData, &error) as Data? else { throw BridgeError("Secure Enclave signing failed") }
    let raw = try derToP1363(der)
    guard raw.count == 64 else { throw BridgeError("invalid ES256 signature length") }
    return b64url(raw)
}

let args = CommandLine.arguments
do {
    guard args.count >= 2 else { throw BridgeError("usage: cieav-macos-secure-enclave <probe|create-p256|describe|sign-es256> ...") }
    switch args[1] {
    case "probe": exit(probe())
    case "create-p256":
        guard args.count == 3 else { throw BridgeError("create-p256 requires key name") }
        let key = try createP256(args[2]); let jwk = try publicJwk(key)
        print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"operation\":\"create-p256\",\"provider\":\"SECURE_ENCLAVE\",\"algorithm\":\"ES256\",\"keyName\":\"\(jsonEscape(args[2]))\",\"hardwareBacked\":true,\"exportable\":false,\"publicJwk\":\(jwk)}")
    case "describe":
        guard args.count == 3 else { throw BridgeError("describe requires key name") }
        let key = try lookupPrivateKey(args[2]); let jwk = try publicJwk(key)
        print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"operation\":\"describe\",\"provider\":\"SECURE_ENCLAVE\",\"algorithm\":\"ES256\",\"keyName\":\"\(jsonEscape(args[2]))\",\"hardwareBacked\":true,\"exportable\":false,\"publicJwk\":\(jwk)}")
    case "sign-es256":
        guard args.count == 4 else { throw BridgeError("sign-es256 requires key name and digest") }
        let signature = try signEs256(args[2], args[3])
        print("{\"protocol\":\"CIEAV_KEY_PROVIDER_V1\",\"operation\":\"sign-es256\",\"provider\":\"SECURE_ENCLAVE\",\"keyName\":\"\(jsonEscape(args[2]))\",\"signatureEncoding\":\"IEEE-P1363\",\"signature\":\"\(signature)\"}")
    default: throw BridgeError("unknown command")
    }
} catch {
    fail(String(describing: error))
}
