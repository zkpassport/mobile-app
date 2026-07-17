#!/bin/bash

# Test Play Asset Delivery locally using bundletool
# This script builds, packages, and installs your app with asset packs

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🧪 Testing Play Asset Delivery Locally"
echo "======================================"
echo ""

# Check if bundletool is available
if ! command -v bundletool &> /dev/null && ! [ -f ~/android-tools/bundletool.jar ]; then
    echo "❌ bundletool not found!"
    echo ""
    echo "Please install bundletool:"
    echo "  Option 1 (Homebrew): brew install bundletool"
    echo "  Option 2 (Manual): Download from https://github.com/google/bundletool/releases"
    echo ""
    exit 1
fi

# Set bundletool command
if command -v bundletool &> /dev/null; then
    BUNDLETOOL="bundletool"
else
    BUNDLETOOL="java -jar ~/android-tools/bundletool.jar"
fi

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "❌ No Android device connected!"
    echo "Please connect a device with USB debugging enabled"
    exit 1
fi

echo "✓ Device connected"
echo ""

# Step 1: Setup asset packs
echo "📦 Step 1: Setting up asset packs..."
./scripts/setup-play-asset-delivery.sh
echo ""

# Remove the local artifacts
rm -rf modules/facematch/android/src/main/assets/models/arcface.ort
rm -rf modules/facematch/android/src/main/assets/models/scrfd_2.5g_bnkps.ort
rm -rf android/app/src/main/res/raw/srs_21.local

# Step 2: Build the bundle
echo "🔨 Step 2: Building release bundle..."
cd android
./gradlew clean
./gradlew app:bundleRelease
echo ""

cp proving_artifacts/src/main/assets/srs_21.local app/src/main/res/raw/srs_21.local
cp facematch_models/src/main/assets/models/arcface.ort ../modules/facematch/android/src/main/assets/models/arcface.ort
cp facematch_models/src/main/assets/models/scrfd_2.5g_bnkps.ort ../modules/facematch/android/src/main/assets/models/scrfd_2.5g_bnkps.ort

# Step 3: Generate APKs for local testing
echo "📱 Step 3: Generating APKs with asset packs..."
$BUNDLETOOL build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-with-assets.apks \
  --local-testing \
  --connected-device \
  --overwrite

echo "✓ APKs generated: app-with-assets.apks"
echo ""

# Step 4: Show what's inside
echo "📋 APK contents:"
$BUNDLETOOL dump manifest --bundle=app/build/outputs/bundle/release/app-release.aab | grep -E "(split|module)" || true
echo ""

# Step 5: Uninstall existing app (if present)
echo "🗑️  Step 4: Uninstalling existing app (if present)..."
adb uninstall app.zkpassport.zkpassport 2>/dev/null || echo "No existing app found"
echo ""

# Step 6: Install to device
echo "⬇️ Step 5: Installing app with asset packs to device..."
$BUNDLETOOL install-apks --apks=app-with-assets.apks
echo "✓ App installed successfully"
echo ""

# Step 7: Verify installation
echo "🔍 Step 6: Verifying asset packs..."
echo ""
echo "Installed packages:"
adb shell pm list packages | grep zkpassport || echo "Package not found!"
echo ""

echo "Asset pack locations:"
adb shell run-as app.zkpassport.zkpassport find /data/app -type d -name "*asset-pack*" 2>/dev/null || echo "Run app first to initialize asset packs"
echo ""

# Step 8: Launch the app
echo "🚀 Step 7: Launching app..."
adb shell am start -n app.zkpassport.zkpassport/.MainActivity
sleep 2
echo ""

# Step 9: Monitor logs
echo "📋 Step 8: Monitoring logs for asset delivery..."
echo "Press Ctrl+C to stop"
echo ""
echo "Looking for:"
echo "  - Asset pack status messages"
echo "  - SRS file location"
echo "  - Face model locations"
echo ""

adb logcat -c  # Clear logs
adb logcat | grep -E "(AssetDelivery|SRS_FILE|FaceMatch|Asset.*pack|proving_artifacts|facematch_models)" --line-buffered --color=auto

