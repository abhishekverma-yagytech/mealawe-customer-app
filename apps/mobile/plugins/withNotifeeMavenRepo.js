const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * @notifee/react-native ships its own `app.notifee:core` AAR as a bundled
 * flat maven-style repo inside the npm package
 * (`android/libs/app/notifee/core/...`, with its own `maven-metadata.xml`) —
 * it is NOT published to Maven Central/Google's Maven despite the module's
 * own `build.gradle` declaring `mavenCentral()` as if it were. Without this
 * repo registered, Gradle fails with "Could not find any matches for
 * app.notifee:core:+". Ships no Expo config plugin of its own, so this
 * survives `expo prebuild` where a hand-edited `android/build.gradle` would
 * be wiped on the next regenerate.
 */
function withNotifeeMavenRepo(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withNotifeeMavenRepo only supports Groovy build.gradle files');
    }
    const marker = 'notifee/react-native/android/libs';
    if (config.modResults.contents.includes(marker)) {
      return config;
    }
    const repoBlock = `        maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }\n`;
    const anchor = /allprojects\s*\{\s*repositories\s*\{/;
    if (!anchor.test(config.modResults.contents)) {
      throw new Error('withNotifeeMavenRepo: could not find allprojects.repositories block to patch');
    }
    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      (match) => `${match}\n${repoBlock}`,
    );
    return config;
  });
}

module.exports = withNotifeeMavenRepo;
