const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Enables Gradle's build cache (org.gradle.caching) so unchanged task outputs
 * (across autolinked native modules, not just app code) are reused between
 * incremental local builds instead of recompiled every time — see
 * docs/BUILD-OPTIMIZATION-PLAN.md #8. Config-plugin-injected because a
 * hand-edited android/gradle.properties would be wiped on the next
 * `expo prebuild`.
 *
 * Deliberately NOT enabling org.gradle.configuration-cache here: several
 * third-party Gradle plugins pulled in by autolinked RN modules aren't
 * verified configuration-cache-compatible, and a broken configuration cache
 * fails the build outright rather than just being slower — worth a dedicated
 * compatibility pass (`./gradlew build --configuration-cache`, read what it
 * flags) before turning it on, not a blind flip alongside the build cache.
 */
function withGradleBuildCache(config) {
  return withGradleProperties(config, (config) => {
    const key = 'org.gradle.caching';
    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === key),
    );
    config.modResults.push({ type: 'property', key, value: 'true' });
    return config;
  });
}

module.exports = withGradleBuildCache;
