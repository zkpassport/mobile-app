#!/bin/bash

set -e

mkdir -p modules/facematch/ios/models
mkdir -p modules/facematch/android/src/main/assets/models

# Download models
# ----------------------------
# If arcface.ort does not exist in modules/facematch/ios/models, download it
if [ ! -f "modules/facematch/ios/models/arcface.ort" ]; then
  echo "Downloading arcface.ort..."
  curl -o modules/facematch/ios/models/arcface.ort https://cdn.zkpassport.id/models/arcface.ort
  # Copy to Android location
  cp modules/facematch/ios/models/arcface.ort modules/facematch/android/src/main/assets/models/
fi

# If scrfd_2.5g_bnkps.ort does not exist in modules/facematch/ios/models, download it
if [ ! -f "modules/facematch/ios/models/scrfd_2.5g_bnkps.ort" ]; then
  echo "Downloading scrfd_2.5g_bnkps.ort..."
  curl -o modules/facematch/ios/models/scrfd_2.5g_bnkps.ort https://cdn.zkpassport.id/models/scrfd_2.5g_bnkps.ort
  # Copy to Android location
  cp modules/facematch/ios/models/scrfd_2.5g_bnkps.ort modules/facematch/android/src/main/assets/models/
fi
