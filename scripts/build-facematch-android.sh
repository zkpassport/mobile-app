#!/bin/bash

set -e

# Android build script for facematch library using pre-built ONNX Runtime
# =======================================================================

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

# Install Rust Android targets if not already installed
echo "Installing Rust Android targets..."
rustup target add aarch64-linux-android #armv7-linux-androideabi i686-linux-android x86_64-linux-android

# Download pre-built ONNX Runtime for Android
ORT_VERSION="1.22.0"
ORT_ANDROID_AAR_URL="https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/${ORT_VERSION}/onnxruntime-android-${ORT_VERSION}.aar"

if [ ! -d "temp/onnxruntime-android-${ORT_VERSION}" ]; then
  echo "Downloading pre-built ONNX Runtime for Android..."
  mkdir -p temp
  cd temp

  # Download the AAR file
  curl -L -o "onnxruntime-android-${ORT_VERSION}.aar" "$ORT_ANDROID_AAR_URL"

  # Extract the AAR (it's just a ZIP file)
  mkdir -p "onnxruntime-android-${ORT_VERSION}"
  cd "onnxruntime-android-${ORT_VERSION}"
  unzip -q "../onnxruntime-android-${ORT_VERSION}.aar"

  echo "ONNX Runtime extracted to: $(pwd)"
  cd ../..
fi

cd modules/facematch/rust

# Setup cargo config for Android cross-compilation
mkdir -p .cargo
cat > .cargo/config.toml << EOF
[target.aarch64-linux-android]
ar = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-ar"
linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/aarch64-linux-android21-clang"
rustflags = [
  "-C", "link-arg=-L../../../temp/onnxruntime-android-${ORT_VERSION}/jni/arm64-v8a",
  "-C", "link-arg=-lonnxruntime"
]

[target.armv7-linux-androideabi]
ar = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-ar"
linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/armv7a-linux-androideabi21-clang"

[target.i686-linux-android]
ar = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-ar"
linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/i686-linux-android21-clang"

[target.x86_64-linux-android]
ar = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-ar"
linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/x86_64-linux-android21-clang"
EOF

# Build the Rust library for each Android ABI
# --------------------------------------------

# Use the pre-built ONNX Runtime AAR
ORT_ANDROID_DIR="../../../temp/onnxruntime-android-${ORT_VERSION}"

# Set environment variables for the ort crate to use system libraries
export ORT_USE_CUDA=OFF
export ORT_STRATEGY=system
export ORT_LIB_LOCATION="$ORT_ANDROID_DIR/jni/arm64-v8a"
export ORT_INCLUDE_DIR="$ORT_ANDROID_DIR/headers"

# Create output directory for Android libs
ANDROID_OUT_DIR=../android/src/main/jniLibs
mkdir -p $ANDROID_OUT_DIR

# Function to build for a specific target
build_for_target() {
  local RUST_TARGET=$1
  local ANDROID_ABI=$2

  echo "Building for $RUST_TARGET ($ANDROID_ABI)..."

  # Build with cargo
  cargo rustc --release --target $RUST_TARGET --crate-type cdylib

  # Create ABI directory
  mkdir -p $ANDROID_OUT_DIR/$ANDROID_ABI

  # Copy the built library
  if [ -f "target/$RUST_TARGET/release/libfacematch.so" ]; then
    cp target/$RUST_TARGET/release/libfacematch.so $ANDROID_OUT_DIR/$ANDROID_ABI/
  else
    echo "Error: libfacematch.so not found for $RUST_TARGET"
    exit 1
  fi

  # Copy ONNX Runtime library from AAR
  if [ -f "$ORT_ANDROID_DIR/jni/$ANDROID_ABI/libonnxruntime.so" ]; then
    cp "$ORT_ANDROID_DIR/jni/$ANDROID_ABI/libonnxruntime.so" $ANDROID_OUT_DIR/$ANDROID_ABI/
    echo "Copied ONNX Runtime library for $ANDROID_ABI"
  else
    echo "Warning: ONNX Runtime library not found for $ANDROID_ABI"
  fi

  # Strip symbols to reduce size
  $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$NDK_HOST/bin/llvm-strip \
    $ANDROID_OUT_DIR/$ANDROID_ABI/libfacematch.so

  echo "Built library size for $ANDROID_ABI:"
  du -h $ANDROID_OUT_DIR/$ANDROID_ABI/libfacematch.so
}

# Build for all ABIs
build_for_target "aarch64-linux-android" "arm64-v8a"
#build_for_target "armv7-linux-androideabi" "armeabi-v7a"
#build_for_target "i686-linux-android" "x86"
#build_for_target "x86_64-linux-android" "x86_64"

echo "Android build complete!"
echo "Libraries are in: $ANDROID_OUT_DIR"

cd -
