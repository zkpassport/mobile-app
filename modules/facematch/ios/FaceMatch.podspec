Pod::Spec.new do |s|
  s.name             = 'FaceMatch'
  s.version          = '1.0.0'
  s.summary          = 'Private FaceMatch module'
  s.description      = 'Private FaceMatch module'
  s.author           = 'ZKPassport'
  s.homepage         = 'https://zkpassport.id'
  s.platforms        = {
    :ios => '15.1'
  }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # FaceMatch lib and headers
  s.vendored_libraries = "lib/libfacematch.a"
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"

  # Frameworks used by FaceMatch
  s.frameworks = 'CoreML', 'Metal', 'Accelerate', 'Foundation'

  # Include ONNX model files into the module bundle so they can be loaded at runtime
  s.resources = "models/*.{ort}"

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'gnu++17',
    'CLANG_CXX_LIBRARY'           => 'libc++'
  }
end
