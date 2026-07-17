#!/bin/bash

set -e

# Do a cargo clean if asked to
if [ "$1" == "clean" ]; then
  echo "Cleaning cargo..."
  (cd modules/facematch/rust && cargo clean)
fi

./scripts/build-facematch-ios.sh
./scripts/build-facematch-android.sh
