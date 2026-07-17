import type { Config } from "jest"

const config: Config = {
  verbose: false,
  projects: [
    {
      displayName: "test",
      testMatch: ["<rootDir>/tests/**/*.(test).(ts|tsx)"],
      preset: "jest-expo",
      extensionsToTreatAsEsm: [".ts", ".tsx"],
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
      transform: {
        "\\.[jt]sx?$": [
          "babel-jest",
          {
            configFile: "./babel.config.test.js",
          },
        ],
      },
      moduleNameMapper: {
        "^@/assets/(.*)$": "<rootDir>/assets/$1",
        "^@/(.*)$": "<rootDir>/src/$1",
        "^modules/(.*)$": "<rootDir>/modules/$1",
      },
      testEnvironment: "jsdom",
      transformIgnorePatterns: [
        "node_modules/(?!(@zkpassport|@zk-kit|expo-keep-awake|react-native-restart|@noble|@obsidion|@tamagui|expo-linear-gradient|@expo|expo|react-native|@react-native|@babel/runtime|expo-modules-core|@testing-library|jest-expo|expo-localization|expo-device|expo-linear-gradient|expo-font|expo-av|react-i18next|expo-camera|expo-local-authentication|expo-blur|react-native-gzip|expo-router|expo-status-bar|react-native-exception-handler|expo-secure-store|date-fns/locale|lucide-react-native|expo-router|lottie-react-native|@tamagui/core|uuid|cbor-x|expo-image-manipulator|expo-asset|expo-modules-core|expo-constants|react-native-reanimated|react-native-worklets|NativeAnimatedHelper)/)",
      ],
    },
    {
      displayName: "lint",
      runner: "jest-runner-eslint",
      testMatch: ["<rootDir>/(src|tests)/**/*.(ts|tsx)"],
    },
  ],
}

export default config
