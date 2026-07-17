Pod::Spec.new do |s|
  s.name           = 'AppAttestModule'
  s.version        = '1.0.0'
  s.summary        = 'App Attest Module for Expo'
  s.description    = 'App Attest Module for Expo'
  s.author         = 'ZKPassport'
  s.homepage       = 'https://zkpassport.id'
  s.platforms      = {
    :ios => '14.0',
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
