# Installing bundletool

bundletool is Google's official command-line tool for working with Android App Bundles (AAB).

## Quick Install

### macOS (Recommended)

```bash
brew install bundletool
```

### Manual Installation (All Platforms)

1. **Download the latest bundletool JAR:**

   ```bash
   # Create tools directory
   mkdir -p ~/android-tools
   cd ~/android-tools

   # Download bundletool (check for latest version at link below)
   curl -L -o bundletool.jar \
     https://github.com/google/bundletool/releases/download/1.17.2/bundletool-all-1.17.2.jar
   ```

   Latest version: https://github.com/google/bundletool/releases

2. **Create an alias (optional but recommended):**

   **For bash (~/.bashrc or ~/.bash_profile):**

   ```bash
   echo 'alias bundletool="java -jar ~/android-tools/bundletool.jar"' >> ~/.bashrc
   source ~/.bashrc
   ```

   **For zsh (~/.zshrc):**

   ```bash
   echo 'alias bundletool="java -jar ~/android-tools/bundletool.jar"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. **Test the installation:**

   ```bash
   bundletool version
   ```

   Should output something like: `1.17.2`

## Requirements

- **Java 8 or higher** (check with `java -version`)
- **ADB (Android Debug Bridge)** - included with Android SDK

## Verify Installation

```bash
# Check bundletool version
bundletool version

# Check Java version (needs to be 8+)
java -version

# Check ADB (should be in your PATH)
adb version
```

## Usage

Once installed, you can use bundletool to:

```bash
# Build APKs from AAB
bundletool build-apks --bundle=app.aab --output=app.apks

# Install APKs to device
bundletool install-apks --apks=app.apks

# Get device specs
bundletool get-device-spec --output=device-spec.json

# Extract device-specific APKs
bundletool extract-apks --apks=app.apks --output-dir=extracted/
```

## Troubleshooting

### "java: command not found"

Install Java:

- **macOS:** `brew install openjdk@11`
- **Linux:** `sudo apt-get install openjdk-11-jdk`
- **Windows:** Download from https://adoptium.net/

### "adb: command not found"

Add Android SDK platform-tools to PATH:

```bash
# macOS/Linux - add to ~/.bashrc or ~/.zshrc
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"

# Or install via Homebrew
brew install android-platform-tools
```

### Permission denied when running bundletool.jar

```bash
chmod +x ~/android-tools/bundletool.jar
```

## Ready to Test!

Once bundletool is installed, run:

```bash
./scripts/test-asset-delivery.sh
```

This will build your app with asset packs and install it to your connected device for testing.
