# Testing Play Asset Delivery Locally

## Overview

You can test Play Asset Delivery locally without uploading to Google Play using **bundletool**. This tool simulates how Google Play delivers your app and asset packs to devices.

## Step 1: Install bundletool

### Option A: Download JAR (Recommended)

Download the latest bundletool from GitHub:

```bash
# Create a tools directory
mkdir -p ~/android-tools
cd ~/android-tools

# Download bundletool (replace with latest version from GitHub releases)
curl -L -o bundletool.jar https://github.com/google/bundletool/releases/download/1.17.2/bundletool-all-1.17.2.jar

# Create an alias for easier use
alias bundletool='java -jar ~/android-tools/bundletool.jar'
```

**Latest version:** https://github.com/google/bundletool/releases

### Option B: Using Homebrew (macOS)

```bash
brew install bundletool
```

## Step 2: Build Your App Bundle

First, make sure you've run the setup script to copy the asset files:

```bash
# From project root
./scripts/setup-play-asset-delivery.sh

# Build the release bundle
cd android
./gradlew bundleRelease
```

Your AAB will be at: `android/app/build/outputs/bundle/release/app-release.aab`

## Step 3: Generate APKs with Asset Packs

Use bundletool to create an APK set from your AAB:

```bash
cd android

# Generate APKs with local testing mode
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --local-testing \
  --connected-device

# OR for a specific device (if multiple devices connected)
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --local-testing \
  --device-id=<DEVICE_SERIAL>
```

### Flags Explained:

- `--local-testing`: Enables local testing mode so asset packs are installed immediately
- `--connected-device`: Generates APKs only for your connected device (faster)
- `--device-id`: Specify a particular device if you have multiple connected

**Without `--local-testing`**: Asset packs with `install-time` delivery mode won't be automatically installed during local testing.

## Step 4: Install to Device

### Automatic Installation

```bash
bundletool install-apks --apks=app-with-assets.apks
```

This will:

1. Install the base APK
2. Install the asset pack APKs (`facematch_models` and `proving_artifacts`)
3. Make them available to your app immediately

### Manual Installation (Alternative)

```bash
# Extract the APK set
unzip app-with-assets.apks -d extracted-apks

# Install base APK
adb install extracted-apks/base-master.apk

# Install asset pack APKs
adb install extracted-apks/facematch_models-master.apk
adb install extracted-apks/proving_artifacts-master.apk
```

## Step 5: Verify Asset Packs

### Check Installed Asset Packs

```bash
# List all APKs installed for your app
adb shell pm list packages -f | grep zkpassport

# Check asset pack locations
adb shell run-as app.zkpassport.zkpassport ls -lR /data/app/*/asset-pack/
```

### Expected Output:

You should see directories like:

```
/data/app/<package-hash>/asset-pack/facematch_models/
/data/app/<package-hash>/asset-pack/proving_artifacts/
```

### Test Asset Pack Access in App

Add some logging to verify assets are found:

```bash
# Monitor logs while opening the app
adb logcat | grep -E "(AssetDelivery|SRS_FILE|FaceMatch)"
```

You should see logs like:

```
AssetDelivery: Asset pack facematch_models status: completed
AssetDelivery: Asset pack proving_artifacts status: completed
SRS_FILE_FOUND: Found srs_21.local via Play Asset Delivery
FaceMatch: Using Play Asset Delivery model: /data/app/.../asset-pack/facematch_models/arcface.ort
```

## Step 6: Inspect APK Contents (Optional)

View what's inside the APK set:

```bash
bundletool dump manifest --bundle=app/build/outputs/bundle/release/app-release.aab

# Or extract and inspect
unzip -l app-with-assets.apks
```

## Testing Different Delivery Modes

### Install-Time (Your Current Setup)

Asset packs are delivered during app installation. No additional code needed.

```bash
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --local-testing \
  --connected-device
```

### Fast-Follow or On-Demand

If you change delivery modes in your `build.gradle` files:

```bash
# For on-demand testing, you'll need to:
# 1. Build APKs without --local-testing
# 2. Install base APK first
# 3. Test your PlayAssetInitializer component requesting the packs

bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --connected-device

bundletool install-apks --apks=app-with-assets.apks
```

## Complete Testing Workflow

Here's a complete script you can run:

```bash
#!/bin/bash

# From project root
cd /Users/madztheo/Documents/ZKpassport/mobile/zkpassport-mobile-app

# 1. Copy assets to asset packs
echo "📦 Setting up asset packs..."
./scripts/setup-play-asset-delivery.sh

# 2. Build the bundle
echo "🔨 Building release bundle..."
cd android
./gradlew bundleRelease

# 3. Generate APKs for local testing
echo "📱 Generating APKs..."
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --local-testing \
  --connected-device \
  --overwrite

# 4. Install to device
echo "⬇️ Installing to device..."
bundletool install-apks --apks=app-with-assets.apks

# 5. Launch the app
echo "🚀 Launching app..."
adb shell am start -n app.zkpassport.zkpassport/.MainActivity

# 6. Monitor logs
echo "📋 Monitoring logs (Ctrl+C to stop)..."
adb logcat | grep -E "(AssetDelivery|SRS_FILE|FaceMatch|FATAL)"
```

Save this as `scripts/test-asset-delivery.sh` and run it.

## Troubleshooting

### Issue: "Asset pack not found"

**Solution:** Make sure you used `--local-testing` flag:

```bash
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --local-testing \
  --connected-device
```

### Issue: "No connected devices"

**Solution:** Check device connection:

```bash
adb devices

# If no devices, reconnect or enable USB debugging
```

### Issue: "Installation failed"

**Solution:** Uninstall existing app first:

```bash
adb uninstall app.zkpassport.zkpassport
bundletool install-apks --apks=app-with-assets.apks
```

### Issue: Assets not in expected location

**Solution:** Check actual asset pack paths:

```bash
# Find actual asset pack location
adb shell find /data/app -name "facematch_models" 2>/dev/null
adb shell find /data/app -name "proving_artifacts" 2>/dev/null

# List contents
adb shell run-as app.zkpassport.zkpassport find /data/app -type d -name "*asset-pack*"
```

## Verify Asset Sizes

Check that your large files are in the asset packs, not the base APK:

```bash
# Extract and check sizes
unzip app-with-assets.apks -d extracted

# Base APK should be small
ls -lh extracted/*base*.apk

# Asset pack APKs should contain your large files
ls -lh extracted/*facematch*.apk
ls -lh extracted/*proving*.apk
```

## Testing on Multiple Devices

Generate a universal APK set (works on all devices):

```bash
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-universal.apks \
  --mode=universal \
  --local-testing

# Extract the universal APK
unzip app-universal.apks universal.apk

# Install on any device
adb install universal.apk
```

**Note:** Universal mode includes all architectures and densities, so it's larger.

## Next Steps

Once local testing works:

1. ✅ Upload AAB to Play Console Internal Testing
2. ✅ Install from Play Store on test device
3. ✅ Verify asset packs download automatically
4. ✅ Test with slower internet (Play will handle WiFi prompts)
5. ✅ Test with `PlayAssetInitializer` component UI

## Resources

- **bundletool GitHub:** https://github.com/google/bundletool
- **bundletool Documentation:** https://developer.android.com/tools/bundletool
- **Play Asset Delivery Guide:** https://developer.android.com/guide/playcore/asset-delivery
- **Testing Guide:** https://developer.android.com/guide/playcore/asset-delivery/test
