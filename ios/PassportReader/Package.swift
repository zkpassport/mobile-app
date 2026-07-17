// swift-tools-version:5.9

import PackageDescription

let package = Package(
    name: "PassportReader",
    defaultLocalization: "en",
    platforms: [
        .iOS("15.0"),
        .macOS(.v10_15)
    ],
    products: [
        .library(
            name: "PassportReader",
            targets: ["PassportReader"]),
    ],
    dependencies: [
        .package(url: "https://github.com/krzyzanowskim/OpenSSL.git", .upToNextMinor(from: "3.3.1000")),
        .package(url: "https://github.com/attaswift/BigInt.git", from: "5.4.1")
        // .package(url: "https://github.com/apple/swift-crypto.git", "1.0.0" ..< "3.0.0"),
        // .package(url: "https://github.com/jernejstrasner/CCommonCrypto.git", branch: "master"),
        // .package(url: "https://github.com/apple/swift-numerics.git", from: "1.0.2"),
   ],
    targets: [
        .target(
            name: "PassportReader",
            dependencies: ["OpenSSL", "BigInt"],
            resources: [
                .process("Resources")
            ]
        ),
    ]
)
