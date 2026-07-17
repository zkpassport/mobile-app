#!/bin/bash
#
# Setup script for opencv-mobile on iOS (arm64 only)
# Downloads and extracts the opencv-mobile framework from GitHub releases
#
# Usage: ./scripts/setup-opencv-mobile.sh
#

set -e

# Configuration
OPENCV_VERSION="4.12.0"
RELEASE_TAG="v34"
FRAMEWORK_NAME="opencv2.framework"
# Use iOS-specific package (smaller than the universal apple package)
DOWNLOAD_URL="https://github.com/nihui/opencv-mobile/releases/download/${RELEASE_TAG}/opencv-mobile-${OPENCV_VERSION}-ios.zip"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IOS_DIR="${PROJECT_ROOT}/ios"
FRAMEWORKS_DIR="${IOS_DIR}/Frameworks"
TEMP_DIR="${PROJECT_ROOT}/temp/opencv-mobile"
ZIP_FILE="${TEMP_DIR}/opencv-mobile-${OPENCV_VERSION}-ios.zip"

echo "================================================"
echo "Setting up opencv-mobile ${OPENCV_VERSION} for iOS (arm64)"
echo "================================================"
echo ""

# Create directories
mkdir -p "$FRAMEWORKS_DIR"
mkdir -p "$TEMP_DIR"

# Check if framework already exists
if [ -d "${FRAMEWORKS_DIR}/${FRAMEWORK_NAME}" ]; then
    echo "opencv2.framework already exists at ${FRAMEWORKS_DIR}/${FRAMEWORK_NAME}"
    echo "Deleting existing framework..."
    rm -rf "${FRAMEWORKS_DIR}/${FRAMEWORK_NAME}"
fi

# Also remove xcframework if it exists from previous setup
if [ -d "${FRAMEWORKS_DIR}/opencv2.xcframework" ]; then
    echo "Removing old opencv2.xcframework..."
    rm -rf "${FRAMEWORKS_DIR}/opencv2.xcframework"
fi

# Download the framework
echo "Downloading opencv-mobile (iOS arm64) from:"
echo "  ${DOWNLOAD_URL}"
echo ""

if command -v curl &> /dev/null; then
    curl -L -o "$ZIP_FILE" "$DOWNLOAD_URL" --progress-bar
elif command -v wget &> /dev/null; then
    wget -O "$ZIP_FILE" "$DOWNLOAD_URL"
else
    echo "Error: Neither curl nor wget is available. Please install one of them."
    exit 1
fi

echo ""
echo "Download complete. Extracting..."

# Extract the framework
cd "$TEMP_DIR"
unzip -q -o "$ZIP_FILE"

# Find and copy the framework
EXTRACTED_FRAMEWORK=$(find "$TEMP_DIR" -name "opencv2.framework" -type d | head -1)

if [ -z "$EXTRACTED_FRAMEWORK" ]; then
    echo "Error: opencv2.framework not found in the downloaded archive."
    echo "Contents of temp directory:"
    ls -la "$TEMP_DIR"
    exit 1
fi

echo "Found framework at: $EXTRACTED_FRAMEWORK"
echo "Copying to: ${FRAMEWORKS_DIR}/${FRAMEWORK_NAME}"

cp -R "$EXTRACTED_FRAMEWORK" "${FRAMEWORKS_DIR}/"

# Show framework info
echo ""
echo "Framework architectures:"
lipo -info "${FRAMEWORKS_DIR}/${FRAMEWORK_NAME}/opencv2" 2>/dev/null || echo "  (unable to determine)"

# Clean up
echo ""
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo ""
echo "================================================"
echo "opencv-mobile setup complete!"
echo "================================================"
echo ""
echo "Framework installed at:"
echo "  ${FRAMEWORKS_DIR}/${FRAMEWORK_NAME}"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Open the Xcode project/workspace"
echo ""
echo "2. Add the framework to your target:"
echo "   - Select your project in the navigator"
echo "   - Select the 'zkpassportmobileapp' target"
echo "   - Go to 'General' tab"
echo "   - Scroll to 'Frameworks, Libraries, and Embedded Content'"
echo "   - Click '+' and then 'Add Other...' -> 'Add Files...'"
echo "   - Navigate to ios/Frameworks/opencv2.framework and add it"
echo "   - Set 'Embed' to 'Do Not Embed' (it's a static framework)"
echo ""
echo "3. Add the OpenCV wrapper files to your project:"
echo "   - Right-click on the MrzScanner group in Xcode"
echo "   - Select 'Add Files to \"zkpassportmobileapp\"'"
echo "   - Add both:"
echo "     - ios/MrzScanner/OpenCVWrapper.h"
echo "     - ios/MrzScanner/OpenCVWrapper.mm"
echo ""
echo "4. Update Header Search Paths (if needed):"
echo "   - Go to 'Build Settings' tab"
echo "   - Search for 'Header Search Paths'"
echo "   - Add: \$(PROJECT_DIR)/Frameworks/opencv2.framework/Headers"
echo ""
echo "5. Run 'pod install' and rebuild the project"
echo ""
