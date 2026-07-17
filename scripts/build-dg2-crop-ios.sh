#!/bin/bash
set -e

echo "Building dg2-crop for iOS..."

# Navigate to the rust directory
cd "$(dirname "$0")/../modules/dg2-crop/rust"

# Set iOS deployment target to match the podspec (15.1)
export IPHONEOS_DEPLOYMENT_TARGET=15.1

# Build for iOS device (arm64)
echo "Building for aarch64-apple-ios..."
cargo build --release --target aarch64-apple-ios --lib

# Create iOS lib directory
mkdir -p ../ios/lib

# Copy device library
echo "Copying device library..."
cp target/aarch64-apple-ios/release/libdg2crop.a ../ios/lib/libdg2crop.a

echo "iOS library built successfully!"
echo "  Device: modules/dg2-crop/ios/lib/libdg2crop.a"
