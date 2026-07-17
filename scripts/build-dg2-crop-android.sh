#!/bin/bash
set -e

echo "Building dg2-crop for Android..."

# Navigate to the rust directory
cd "$(dirname "$0")/../modules/dg2-crop/rust"

# Setup Android NDK
if [ -z "$ANDROID_NDK_HOME" ]; then
  echo "ANDROID_NDK_HOME is not set. Please set it to your Android NDK path."
  echo "Example: export ANDROID_NDK_HOME=~/Library/Android/sdk/ndk/26.3.11579264"
  exit 1
fi

echo "Using Android NDK at: $ANDROID_NDK_HOME"

# Detect host OS for NDK toolchain path
case "$(uname -s)" in
  Darwin*)
    NDK_HOST="darwin-x86_64"
    ;;
  Linux*)
    NDK_HOST="linux-x86_64"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

echo "Using NDK host platform: $NDK_HOST"

# Install Rust Android target if not already installed
echo "Installing Rust Android target..."
rustup target add aarch64-linux-android

# Setup cargo config for Android cross-compilation
mkdir -p .cargo
cat > .cargo/config.toml << EOF
[target.aarch64-linux-android]
ar = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-ar"
linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/aarch64-linux-android21-clang"
EOF

# Set environment variables for C/C++ compilation
export CC_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/aarch64-linux-android21-clang"
export CXX_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/aarch64-linux-android21-clang++"
export AR_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-ar"

# Build for Android arm64-v8a
echo "Building for aarch64-linux-android..."
cargo build --release --target aarch64-linux-android --lib

# Create jniLibs directory
echo "Copying library to jniLibs..."
mkdir -p ../android/src/main/jniLibs/arm64-v8a

# Copy library
cp target/aarch64-linux-android/release/libdg2crop.so ../android/src/main/jniLibs/arm64-v8a/

echo "Android library built successfully!"
echo "  arm64-v8a: modules/dg2-crop/android/src/main/jniLibs/arm64-v8a/libdg2crop.so"
