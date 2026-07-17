#!/bin/bash

set -e

# Download SRS file if not present
./scripts/download-srs.sh

# Remove the local artifacts
rm -rf modules/facematch/android/src/main/assets/models/arcface.ort
rm -rf modules/facematch/android/src/main/assets/models/scrfd_2.5g_bnkps.ort
rm -rf android/app/src/main/res/raw/srs_21.local

cd android

# Clean build directories manually to avoid CMake circular dependency with codegen
# The gradlew clean task fails because it tries to regenerate CMake config
# which needs codegen directories that were just cleaned
rm -rf app/build
rm -rf app/.cxx
rm -rf build
rm -rf .gradle/buildOutputCleanup

# Now run the release build (this will regenerate codegen as needed)
./gradlew app:bundleRelease
cd ..

# Copy the local artifacts back
cp android/proving_artifacts/src/main/assets/srs_21.local android/app/src/main/res/raw/srs_21.local
cp android/facematch_models/src/main/assets/models/arcface.ort modules/facematch/android/src/main/assets/models/arcface.ort
cp android/facematch_models/src/main/assets/models/scrfd_2.5g_bnkps.ort modules/facematch/android/src/main/assets/models/scrfd_2.5g_bnkps.ort
