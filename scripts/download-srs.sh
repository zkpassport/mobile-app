#!/bin/bash

set -e

# Create directories if they don't exist
mkdir -p temp
mkdir -p android/proving_artifacts/src/main/assets
mkdir -p android/app/src/main/res/raw
mkdir -p ios

# Download URL
SRS_URL="https://cdn.zkpassport.id/srs/21.srs"
TEMP_SRS_FILE="temp/srs_21.local"

# Download SRS file once to temp directory if not already present
# ----------------------------
if [ ! -f "$TEMP_SRS_FILE" ]; then
  echo "Downloading SRS file..."
  curl -o "$TEMP_SRS_FILE" "$SRS_URL"
  echo "Download complete!"
fi

# Copy to iOS location if needed
COPY_SRS_DEST_PATH=ios/srs_21.local
if [ ! -f "$COPY_SRS_DEST_PATH" ]; then
  echo "Copying SRS file to $COPY_SRS_DEST_PATH..."
  cp "$TEMP_SRS_FILE" "$COPY_SRS_DEST_PATH"
fi

# Copy to Android locations if needed
COPY_SRS_DEST_PATH=android/proving_artifacts/src/main/assets/srs_21.local
if [ ! -f "$COPY_SRS_DEST_PATH" ]; then
  echo "Copying SRS file to $COPY_SRS_DEST_PATH..."
  cp "$TEMP_SRS_FILE" "$COPY_SRS_DEST_PATH"
fi
COPY_SRS_DEST_PATH=android/app/src/main/res/raw/srs_21.local
if [ ! -f "$COPY_SRS_DEST_PATH" ]; then
  echo "Copying SRS file to $COPY_SRS_DEST_PATH..."
  cp "$TEMP_SRS_FILE" "$COPY_SRS_DEST_PATH"
fi
