# Build Scripts

This directory contains build and utility scripts for the ZKPassport mobile app.

## Version Management

### `version.ts`

Manages version bumping and syncing across `app.json` and iOS / Android project files.

**Usage:**
```bash
# Bump patch version (e.g., 0.9.11 -> 0.9.12)
bun run scripts/version.ts patch
# or: npm run version:patch

# Bump minor version (e.g., 0.9.11 -> 0.10.0)
bun run scripts/version.ts minor
# or: npm run version:minor

# Sync current version to native files
bun run scripts/version.ts sync
# or: npm run version:sync
```

**What it does:**
- `patch`: Increments patch version, calculates versionCode, updates `app.json` and syncs to native files
- `minor`: Increments minor version, resets patch to 0, calculates versionCode, updates `app.json` and syncs
- `sync`: Syncs current version in `app.json` to native files without bumping

**Updates:**
- `expo.android.versionCode` in `app.json` (calculated from version)
- iOS `MARKETING_VERSION` in `ios/zkpassportmobileapp.xcodeproj/project.pbxproj`
- iOS `CFBundleShortVersionString` in `ios/zkpassportmobileapp/Info.plist`
- Android `versionName` and `versionCode` in `android/app/build.gradle`

**Version code calculation:**
- Format: `major * 10000 + minor * 100 + patch`
- Example: `0.9.11` → `911`, `1.4.7` → `10407`

## Other Scripts

### `build-android-release.sh`
Builds a release APK for Android. Automatically downloads SRS files before building.

### `build-facematch-android.sh` / `build-facematch-ios.sh`
Builds facematch modules for Android and iOS respectively.

### `download-facematch-models.sh`
Downloads the required facematch model files for iOS and Android:
- `arcface.ort` - Face recognition model
- `scrfd_2.5g_bnkps.ort` - Face detection model

**Usage:**
```bash
./scripts/download-facematch-models.sh
```

### `download-srs.sh`
Downloads the SRS for log dyadic 21 (allowing proving of circuits up to 2**21 gates). The script downloads the file once to `temp/srs_21.local` and then copies it to all required locations:
- `ios/srs_21.local`
- `android/proving_artifacts/src/main/assets/srs_21.local`
- `android/app/src/main/res/raw/srs_21.local`

The script is idempotent - it will skip downloading if the temp file exists and skip copying if target files already exist.

**Usage:**
```bash
./scripts/download-srs.sh
```

**Note:** This script is automatically called:
- During EAS builds (via prebuildCommand in eas.json)
- When running `./scripts/build-android-release.sh`
