#!/usr/bin/env bun

/**
 * Version management script
 *
 * Usage:
 *   bun run scripts/version.ts patch  - Bump patch version and sync
 *   bun run scripts/version.ts minor  - Bump minor version and sync
 *   bun run scripts/version.ts sync   - Sync current version to iOS/Android project files
 */

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

interface AppJson {
  expo?: {
    version?: string
    android?: {
      versionCode?: number
    }
  }
}

const root = process.cwd()
const appJsonPath = path.join(root, "app.json")
const iosPbxprojPath = path.join(root, "ios/zkpassportmobileapp.xcodeproj/project.pbxproj")
const iosInfoPlistPath = path.join(root, "ios/zkpassportmobileapp/Info.plist")
const androidBuildGradlePath = path.join(root, "android/app/build.gradle")

function readAppJson(): AppJson {
  const content = fs.readFileSync(appJsonPath, "utf8")
  return JSON.parse(content)
}

function writeAppJson(appJson: AppJson): void {
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n", "utf8")
}

function bumpVersion(version: string, type: "patch" | "minor"): string {
  const parts = version.split(".").map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`)
  }

  if (type === "minor") {
    parts[1]++
    parts[2] = 0
  } else {
    parts[2]++
  }

  return parts.join(".")
}

function syncVersion(version: string): void {
  // Update iOS project.pbxproj
  try {
    let pbxprojContent = fs.readFileSync(iosPbxprojPath, "utf8")
    pbxprojContent = pbxprojContent.replace(
      /MARKETING_VERSION = [^;]+;/g,
      `MARKETING_VERSION = ${version};`,
    )
    // Ensure file ends with newline
    if (!pbxprojContent.endsWith("\n")) pbxprojContent += "\n"
    fs.writeFileSync(iosPbxprojPath, pbxprojContent, "utf8")
    console.log(`iOS project.pbxproj: ${version}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
    console.warn("iOS project.pbxproj not found, skipping")
  }

  // Update iOS Info.plist
  try {
    let infoPlistContent = fs.readFileSync(iosInfoPlistPath, "utf8")
    infoPlistContent = infoPlistContent.replace(
      /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
      `$1${version}$2`,
    )
    // Ensure file ends with newline
    if (!infoPlistContent.endsWith("\n")) infoPlistContent += "\n"
    fs.writeFileSync(iosInfoPlistPath, infoPlistContent, "utf8")
    console.log(`iOS Info.plist: ${version}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
    console.warn("iOS Info.plist not found, skipping")
  }

  // Update Android
  try {
    let buildGradleContent = fs.readFileSync(androidBuildGradlePath, "utf8")
    buildGradleContent = buildGradleContent.replace(
      /versionName\s+"[^"]+"/,
      `versionName "${version}"`,
    )
    // Ensure file ends with newline
    if (!buildGradleContent.endsWith("\n")) buildGradleContent += "\n"
    fs.writeFileSync(androidBuildGradlePath, buildGradleContent, "utf8")
    console.log(`Android: ${version}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
    console.warn("Android project not found, skipping")
  }
}

function main() {
  const command = process.argv[2]

  if (!command || !["patch", "minor", "sync"].includes(command)) {
    console.error("Usage: bun run scripts/version.ts [patch|minor|sync]")
    process.exit(1)
  }

  const appJson = readAppJson()
  let version = appJson.expo?.version

  if (!version) {
    console.error("No version found in app.json")
    process.exit(1)
  }

  if (command === "patch" || command === "minor") {
    version = bumpVersion(version, command)
    if (!appJson.expo) appJson.expo = {}
    appJson.expo.version = version
    writeAppJson(appJson)
    console.log(`Bumped to ${version}`)
  }

  syncVersion(version)

  // Format app.json
  spawnSync("node_modules/.bin/prettier", ["app.json", "-w"], {
    cwd: root,
    stdio: "inherit",
  })
}

main()
