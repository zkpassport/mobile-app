import { execSync } from "child_process"

describe("Version Sync Check", () => {
  it("should have synchronized versions across all platform files", () => {
    // Only run this test in CI environment
    if (!process.env.CI) {
      console.log("Skipping version sync test (only runs in CI)")
      return
    }

    // Files that should be synced by version:sync
    const versionFiles = [
      "android/app/build.gradle",
      "ios/zkpassportmobileapp.xcodeproj/project.pbxproj",
      "ios/zkpassportmobileapp/Info.plist",
    ]

    // Run version:sync command
    try {
      execSync("npm run version:sync", {
        cwd: process.cwd(),
        stdio: "pipe",
        encoding: "utf8",
      })
    } catch (error) {
      throw new Error(`Failed to run version:sync: ${error}`)
    }

    // Check if any version files changed
    let gitStatus: string
    try {
      gitStatus = execSync("git status --porcelain", {
        cwd: process.cwd(),
        encoding: "utf8",
      })
    } catch (error) {
      throw new Error(`Failed to check git status: ${error}`)
    }

    // Filter to only check the specific version files
    const changedVersionFiles = gitStatus
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "")
      .filter((line) => {
        const filePath = line.substring(3).trim() // Remove git status prefix (e.g., "M ", "??")
        return versionFiles.some((vf) => filePath === vf)
      })

    // If any version files changed, fail with the expected message
    if (changedVersionFiles.length > 0) {
      const modifiedFiles = changedVersionFiles.map((line) => line.trim()).join("\n")

      throw new Error(
        `Please run "npm run version:sync" to sync app.json version with iOS/Android projects\n\nModified files:\n${modifiedFiles}`,
      )
    }
  })
})
