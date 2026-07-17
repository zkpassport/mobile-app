#!/bin/bash

# Navigate to the main android project directory
cd ../../../android

# Set Java version to 17 for compatibility
# export JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.16/libexec/openjdk.jdk/Contents/Home

# Run unit tests
echo "Running unit tests..."
./gradlew :react-native-passport-reader:test

# Run specific test class
echo "Running TrailingZeroBytesTest..."
./gradlew :react-native-passport-reader:test --tests "com.passportreader.TrailingZeroBytesTest"

# Run instrumented tests (requires connected device or emulator)
echo "Running instrumented tests..."
./gradlew :react-native-passport-reader:connectedAndroidTest

# Generate test report
echo "Test reports available at:"
echo "Unit tests: ../modules/native-passport-reader/android/build/reports/tests/test/index.html"