#!/bin/bash

# EAS build pre-install script
# Runs via package.json "eas-build-pre-install" script during EAS build

set -e

# Install rustup (Rust toolchain manager)
echo "Installing rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
export PATH="$HOME/.cargo/bin:$PATH"
set-env PATH "$PATH"
rustc -V
rustup -V

# Install cbindgen
echo "Installing cbindgen..."
cargo install cbindgen --locked
export PATH="$HOME/.cargo/bin:$PATH"
set-env PATH "$PATH"
cbindgen -V

# Install dependencies for iOS platform
if [[ "${EAS_BUILD_PLATFORM:-}" == "ios" ]]; then

  # Install rust target for iOS platform
  echo "Installing rust target for iOS platform..."
  rustup target add aarch64-apple-ios

  export HOMEBREW_NO_INSTALL_CLEANUP=1
  export HOMEBREW_NO_AUTO_UPDATE=1

  # Install Python 3.13 and ensure it's in PATH
  brew install python@3.13
  # Add it to PATH (python3 is in libexec/bin)
  export PATH="$(brew --prefix python@3.13)/libexec/bin:$PATH"
  set-env PATH "$PATH"
  python3 -V

  # Install cmake 3.28.3
  echo "Installing cmake 3.28.3..."
  CMAKE_VERSION="3.28.3"
  CMAKE_DMG_URL="https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-macos-universal.dmg"
  CMAKE_DMG="/tmp/cmake-${CMAKE_VERSION}.dmg"
  CMAKE_INSTALL_DIR="/tmp/cmake-${CMAKE_VERSION}"
  # Download cmake dmg
  curl -L -o "$CMAKE_DMG" "$CMAKE_DMG_URL"
  # Mount the dmg
  hdiutil attach "$CMAKE_DMG" -mountpoint /Volumes/cmake-${CMAKE_VERSION}
  # Copy CMake.app to a temporary directory
  mkdir -p "$CMAKE_INSTALL_DIR"
  cp -R "/Volumes/cmake-${CMAKE_VERSION}/CMake.app/Contents/"* "$CMAKE_INSTALL_DIR/"
  # Unmount the dmg
  hdiutil detach "/Volumes/cmake-${CMAKE_VERSION}"
  # Add cmake to PATH
  export PATH="${CMAKE_INSTALL_DIR}/bin:$PATH"
  set-env PATH "$PATH"
  cmake --version
  # Build facematch for iOS
  ./scripts/build-facematch-ios.sh
  # Setup OpenCV for iOS
  ./scripts/setup-opencv-mobile.sh
  # Build dg2-crop for iOS
  ./scripts/build-dg2-crop-ios.sh

# Install dependencies for Android platform
elif [[ "${EAS_BUILD_PLATFORM:-}" == "android" ]]; then

  # Install rust target for Android platform
  echo "Installing rust target for Android platform..."
  rustup target add aarch64-linux-android

  # Install cmake 3.28.3 on ubuntu-24.04-jdk-17-ndk-r27b (ubuntu-2404-noble-amd64-v20250805)?
  echo "Installing cmake 3.28.3 on ubuntu 24.04..."
  sudo apt-get update
  sudo apt-get install -y cmake=3.28.3-1build7 cmake-data=3.28.3-1build7
  cmake --version
  # Build facematch for Android
  ./scripts/build-facematch-android.sh
  # Build dg2-crop for Android
  ./scripts/build-dg2-crop-android.sh
fi

# Download SRS file
./scripts/download-srs.sh

# Download facematch models
./scripts/download-facematch-models.sh

# Setup Play Asset Delivery structure for Android
if [[ "${EAS_BUILD_PLATFORM:-}" == "android" ]]; then
  echo "Setting up Play Asset Delivery for Android..."
  ./scripts/setup-play-asset-delivery.sh
fi
