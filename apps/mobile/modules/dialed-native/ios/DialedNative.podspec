# Local Expo Module (Flow 08): widget snapshot in the App Group, timeline reloads, Live Activities.
Pod::Spec.new do |s|
  s.name           = 'DialedNative'
  s.version        = '0.1.0'
  s.summary        = 'Dialed glance bridge: widget snapshot and Live Activities'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'dan-od'
  s.homepage       = 'https://github.com/dan-od/dialed'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
