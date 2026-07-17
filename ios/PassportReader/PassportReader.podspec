Pod::Spec.new do |spec|

  spec.name         = "PassportReader"
  spec.version      = "0.0.1"
  spec.summary      = "NFC enabled ePassport reading using iOS 13 CoreNFC APIS"

  spec.homepage     = ""
  spec.license      = ""
  spec.author       = { "" => "" }
  spec.platform = :ios
  spec.ios.deployment_target = "12.0"

  spec.source       = { :git => "", :tag => "#{spec.version}" }

  spec.source_files  = "Sources/**/*.{swift}"

  spec.swift_version = "5.0"

  spec.dependency "OpenSSL-Universal", '1.1.1900'
  spec.xcconfig          = { 'OTHER_LDFLAGS' => '-weak_framework CryptoKit -weak_framework CoreNFC -weak_framework CryptoTokenKit' }

  spec.pod_target_xcconfig = {
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'arm64'
  }
  spec.user_target_xcconfig = { 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'arm64' }

end
