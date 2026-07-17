# App Attest Module

This module provides a unified interface for device attestation on both iOS (using App Attest) and Android (using Play Integrity).

## Features

- **iOS**: Uses Apple's App Attest to generate hardware-backed keys and attestations
- **Android**: Uses Google Play Integrity API for device attestation
- **Unified API**: Same TypeScript interface for both platforms
- **Secure Storage**: Keys and attestations are securely stored

## Setup

### iOS

No additional setup required. App Attest is available on iOS 14.0+.

### Android

1. **Enable Play Integrity in Google Play Console**:
   - Go to your app in Google Play Console
   - Navigate to Release > Setup > App integrity
   - Enable Play Integrity API
   - Note your Cloud project number

2. **Configure Cloud Project Number**:

   Add to your app's `android/app/src/main/AndroidManifest.xml`:

   ```xml
   <application>
     <meta-data
       android:name="com.google.android.play.integrity.cloud_project_number"
       android:value="YOUR_CLOUD_PROJECT_NUMBER" />
   </application>
   ```

   Or configure in your app's `android/app/build.gradle`:

   ```gradle
   android {
     defaultConfig {
       manifestPlaceholders = [
         playIntegrityCloudProjectNumber: "YOUR_CLOUD_PROJECT_NUMBER"
       ]
     }
   }
   ```

   And in AndroidManifest.xml:

   ```xml
   <meta-data
     android:name="com.google.android.play.integrity.cloud_project_number"
     android:value="${playIntegrityCloudProjectNumber}" />
   ```

3. **Link Play Integrity to your app**:
   - In Google Play Console, link your Cloud project
   - Configure allowed package names and signing certificates

## API

### isSupported()

Check if attestation is supported on the current device.

```typescript
const supported = await AppAttestModule.isSupported()
```

### generateKey()

Generate a new attestation key.

```typescript
const keyId = await AppAttestModule.generateKey()
```

### attestKey(keyId, clientDataHash)

Create an attestation for a key with client data.

```typescript
const attestation = await AppAttestModule.attestKey(keyId, clientDataHashBase64)
```

### generateAssertion(keyId, clientDataHash)

Generate an assertion for subsequent requests.

```typescript
const assertion = await AppAttestModule.generateAssertion(keyId, clientDataHashBase64)
```

## Platform Differences

### iOS (App Attest)

- Hardware-backed keys in Secure Enclave
- Attestations are CBOR-encoded
- Environment determined by AAGUID (development/production)
- Keys expire after ~1 year

### Android (Play Integrity + Keystore)

- **Enhanced Security Mode** (Android 7.0+):
  - Hardware-backed keys in Android Keystore (TEE or StrongBox)
  - Key attestation certificates prove key properties
  - Signatures created with hardware keys
  - Play Integrity tokens include key signatures
- **Basic Mode** (Android 5.0+):
  - Uses Play Integrity Standard API only
  - Attestations are JWT tokens
- Environment based on app recognition and device integrity
- Token provider should be prepared ahead of time for better performance

## Enhanced Android Security Features

The Android implementation combines two security mechanisms:

1. **Android Keystore (Hardware Security)**
   - Generates EC P-256 keys in hardware (TEE/StrongBox)
   - Key attestation proves key was generated in secure hardware
   - All signatures are performed in secure hardware
   - Keys cannot be extracted from the device

2. **Play Integrity (App & Device Verification)**
   - Verifies app authenticity and integrity
   - Checks device integrity (not rooted/compromised)
   - Provides signed tokens from Google

This dual approach provides:

- **Cryptographic proof** that operations were performed by a specific hardware-backed key
- **Attestation chain** from the key to Google's root certificate
- **Device integrity** verification through Play Integrity
- **App authenticity** verification

## Security Considerations

1. **Validate attestations server-side**: Never trust client-side validation
2. **Check app integrity**: Verify package name and signing certificate
3. **Monitor for anomalies**: Track attestation failures and patterns
4. **Handle errors gracefully**: Attestation may fail on rooted/jailbroken devices
5. **Verify key attestation**: On Android, verify the key attestation certificate chain
6. **Check hardware backing**: Ensure keys are generated in TEE/StrongBox

## Attestation Response Format

### iOS Response

- Base64-encoded CBOR attestation object
- Contains authenticator data and attestation statement
- Certificate chain leads to Apple Root CA

### Android Enhanced Response

- Base64-encoded JSON object containing:
  - `format`: "android-play-integrity-keystore"
  - `playIntegrityToken`: JWT from Play Integrity
  - `keyId`: The key identifier
  - `signature`: Hardware key signature of client data
  - `keyAttestation`: Object with public key and certificate chain
  - `appId`: Package name
  - `environment`: "production" or "development"

## Error Codes

- `APPATTEST_ERROR`: Generic attestation error
- `FACEMATCH_ERROR`: Face matching specific errors (from the TypeScript layer)
