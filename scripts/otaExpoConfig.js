// Only runtime-facing fields: never put build plugins, signing data, local paths
// or the build environment in a publicly downloadable update manifest.
function buildOtaExpoConfig(exp, runtimeVersion, platform) {
  if (exp.version !== runtimeVersion) {
    throw new Error('OTA runtimeVersion must match the exported app version; a new bundle cannot target an older APK');
  }
  const schemes = Array.isArray(exp.scheme) ? exp.scheme : [exp.scheme];
  if (!exp.name || !exp.slug || !schemes.length
      || !schemes.every((scheme) => typeof scheme === 'string' && /^[a-z][a-z0-9+.-]*$/i.test(scheme))) {
    throw new Error('OTA config requires name, slug and a valid scheme');
  }
  if (platform === 'android' && !exp.android?.package) throw new Error('OTA config requires android.package');
  if (platform === 'ios' && !exp.ios?.bundleIdentifier) throw new Error('OTA config requires ios.bundleIdentifier');
  const result = {
    name: exp.name,
    slug: exp.slug,
    version: exp.version,
    runtimeVersion,
    scheme: exp.scheme,
  };
  for (const key of ['owner', 'sdkVersion', 'orientation', 'userInterfaceStyle']) {
    if (exp[key] !== undefined) result[key] = exp[key];
  }
  if (exp.android?.package) {
    result.android = { package: exp.android.package };
    if (exp.android.versionCode) result.android.versionCode = exp.android.versionCode;
  }
  if (exp.ios?.bundleIdentifier) {
    result.ios = { bundleIdentifier: exp.ios.bundleIdentifier };
    if (exp.ios.buildNumber) result.ios.buildNumber = exp.ios.buildNumber;
  }
  // These are the only runtime extra fields used by this app and Expo Router.
  result.extra = {};
  if (exp.extra?.eas?.projectId) result.extra.eas = { projectId: exp.extra.eas.projectId };
  if (exp.extra?.router) {
    result.extra.router = {};
    for (const key of ['origin', 'headOrigin', 'root', 'unstable_src']) {
      if (exp.extra.router[key] !== undefined) result.extra.router[key] = exp.extra.router[key];
    }
  }
  return result;
}

module.exports = { buildOtaExpoConfig };
