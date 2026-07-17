#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"

echo "Building dg2-crop for all platforms..."

# Build iOS
"$SCRIPT_DIR/build-dg2-crop-ios.sh"

# Build Android
"$SCRIPT_DIR/build-dg2-crop-android.sh"

echo ""
echo "All platforms built successfully!"
