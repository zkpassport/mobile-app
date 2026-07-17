Pod::Spec.new do |s|
  s.name             = 'Dg2Crop'
  s.version          = '1.0.0'
  s.summary          = 'DG2 image cropping module'
  s.description      = 'Crops white borders from DG2 passport images'
  s.author           = 'ZKPassport'
  s.homepage         = 'https://zkpassport.id'
  s.platforms        = {
    :ios => '15.1'
  }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # DG2 Crop lib
  s.vendored_libraries = "lib/libdg2crop.a"
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'gnu++17',
    'CLANG_CXX_LIBRARY'           => 'libc++'
  }
end
