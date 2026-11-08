/**
 * Flow 08 widget extension: WidgetKit widgets, the line under the date and the Live Activity UI.
 * Shares only `snapshot.json` with the app through the App Group (SECURITY.md: no tokens there).
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'DialedWidgets',
  displayName: config.name,
  bundleIdentifier: '.widgets',
  // Same floor as the app; push-to-start needs 17.2 and is checked at runtime (D-12).
  deploymentTarget: '16.4',
  colors: {
    $accent: { color: '#FF5A1F', darkColor: '#FF5A1F' },
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
