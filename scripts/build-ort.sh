#!/bin/bash

# Ensure Python version 3.10 or later is installed
python3 -c 'import sys; sys.exit(1) if sys.version_info.major < 3 or sys.version_info.minor < 10 else sys.exit(0);'
if [ $? -ne 0 ]; then
    echo "Python version: $(python3 --version)"
    echo "Error: Python 3.10 or later is required to build ONNX runtime"
    exit 1
fi

set -e

# Clone ONNX runtime at branch v1.22.1
git clone --branch v1.22.1 --depth 1 --recurse-submodules --shallow-submodules https://github.com/microsoft/onnxruntime.git temp/onnxruntime
cd temp/onnxruntime

# Build for iOS
if [ "$1" == "ios" ]; then
./build.sh --config MinSizeRel --use_xcode --ios \
    --apple_sysroot iphoneos --osx_arch arm64 --apple_deploy_target 13.0 \
    --skip_tests --use_coreml --compile_no_warning_as_error # --minimal_build extended

# Build for Android
elif [ "$1" == "android" ]; then
./build.sh --config MinSizeRel --android \
    --android_sdk_path $ANDROID_HOME \
    --android_ndk_path $ANDROID_NDK_HOME \
    --android_abi arm64-v8a \
    --android_api 34 \
    --skip_tests --compile_no_warning_as_error # --minimal_build extended
else
    echo "Error: Please specify either 'ios' or 'android' as the platform"
    echo "Usage: ./scripts/build-ort.sh [ios|android]"
    exit 1
fi
