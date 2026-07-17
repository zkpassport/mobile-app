#!/bin/bash

set -e

# iOS build script for facematch library

# Clone and build ONNX runtime
# ----------------------------
if [ ! -d "temp/onnxruntime/build" ]; then
  echo "Cloning and building ONNX runtime..."
  (./scripts/build-ort.sh ios)
fi

cd modules/facematch/rust

# Generate C header file
# ----------------------
cbindgen --lang c --crate facematch --output ../ios/lib/facematch.h
#  Remove duplicate analyze_face function declaration
python3 -c "import re
with open('../ios/lib/facematch.h', 'r') as f: content = f.read()
content = re.sub(r'\nchar \*analyze_face\([^;]*?\);\n', '', content, count=1, flags=re.DOTALL)
with open('../ios/lib/facematch.h', 'w') as f: f.write(content)"

# Build the Rust library
# ----------------------
export ORT_LIB_LOCATION=../../../temp/onnxruntime/build
export ORT_LIB_PROFILE=MinSizeRel
cargo rustc --release --target aarch64-apple-ios --crate-type staticlib

# Merge the ORT lib with the Rust lib
# -----------------------------------
ORT_ROOT=../../../temp/onnxruntime/build/iOS/MinSizeRel
RUST_LIB=target/aarch64-apple-ios/release/libfacematch.a
COMBINED_LIB=../ios/lib/libfacematch.a
DEP_LIBS=$(find "$ORT_ROOT" -type f -path "*/MinSizeRel-iphoneos/*.a" | grep -v "test" | sort)

# Create the combined lib
xcrun libtool -static -o "$COMBINED_LIB" \
  "$RUST_LIB" \
  $DEP_LIBS

# Shrink symbols
xcrun strip -S -x -r "$COMBINED_LIB"

# Print the size of the combined lib
du -h "$COMBINED_LIB"

cd -
