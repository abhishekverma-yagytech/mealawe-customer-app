const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Bundle dotLottie (`.lottie`) files as assets so `lottie-react-native` can load
// them via require(). Plain Bodymovin `.json` is already a resolved asset.
if (!config.resolver.assetExts.includes('lottie')) {
  config.resolver.assetExts.push('lottie');
}

module.exports = withNativewind(config, { inlineRem: 16 });
