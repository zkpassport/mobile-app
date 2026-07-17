# ZKPassport Mobile App

## Getting Started

### Install dependencies

```bash
npm install
```

### Build the app

```bash
npx expo prebuild
npx pod-install
```

### Run the app

**iOS**

First run the following command to start the app to start the dev server.

```bash
npx expo start --clear
```

Then open Xcode with the following command.

```bash
xed ios
```

In Xcode, you can run the app by clicking the run button. Make sure to run the app on an actual device as the simulator is not supported by the app

**Alternative: Using Expo CLI directly**

Instead of using Xcode each time, you can run the app on your iPhone using:

```bash
npx expo run:ios --device
```

For a production build that doesn't require the Metro bundler running on the same network (but without console logs):

```bash
npx expo run:ios --configuration Release --device
```

**Android**

First connect your Android device to your computer.

Then run the following command to run the app on your device.

```bash
npm run android
```

## Add the SRS file

The SRS file is too big to be committed to the repository. You can download it here: [srs_21.local](https://drive.google.com/file/d/1y_5Yo6Og6zZL1UjrCj4vmb8IUi0ceyTC/view?usp=sharing)

Once you have downloaded the file, add the files to the following locations:

- `android/proving_artifacts/src/main/assets/srs_21.local`
- `android/app/src/main/res/raw/srs_21.local`
- `ios/srs_21.local`

The file name should be `srs_21.local`.

## Setup OpenCV on iOS

OpenCV binaries are not committed to the repository. To include them in the project, run the following command:

```bash
./scripts/setup-opencv-mobile.sh
```

The rest of the instructions in the script can be ignored as these are a one-time setup already committed to the repository.

## EAS

### Cloud Builds

**Internal Testing**

```bash
npm run eas-cloud-build:internal
```

Triggers an EAS cloud build and submits to:
- **iOS**: TestFlight internal testers group
- **Android**: Play Store internal testing track

**Production**

```bash
npm run eas-cloud-build:production
```

Triggers an EAS cloud build and submits to:
- **iOS**: TestFlight internal testers group (requires manual submission to App Store)
- **Android**: Play Store public release (automatic)

> **Note**: For iOS, both scripts currently behave the same (i.e. submitting to the internal testers group). Manual submission is required for a public release to the App Store.
