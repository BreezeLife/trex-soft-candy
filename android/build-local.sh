#!/usr/bin/env bash
set -euo pipefail

# Reuse installed tools. Gradle writes only to this project's ignored cache;
# an existing user dependency cache is consumed through Gradle's read-only API.
android_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
die() { printf 'Android build stopped: %s\n' "$*" >&2; exit 1; }

offline_args=(--offline)
if [[ "${1:-}" == '--online' ]]; then
  offline_args=()
  shift
fi

trex_java_dir="${TREX_JAVA_HOME:-${JAVA_HOME:-}}"
if [[ -z "$trex_java_dir" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  trex_java_dir=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
if [[ -z "$trex_java_dir" && -x /usr/libexec/java_home ]]; then
  trex_java_dir="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
fi
[[ -x "$trex_java_dir/bin/java" && -x "$trex_java_dir/bin/keytool" ]] || die 'JDK 17 is required; set TREX_JAVA_HOME to an installed JDK.'
trex_java_version="$("$trex_java_dir/bin/java" -version 2>&1)"
[[ "$trex_java_version" == *'version "17.'* ]] || die 'This build pins JDK 17; set TREX_JAVA_HOME to an installed JDK 17.'
export JAVA_HOME="$trex_java_dir"

trex_sdk_dir="${TREX_ANDROID_SDK:-${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}}"
if [[ -z "$trex_sdk_dir" ]]; then
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [[ -f "$candidate/platforms/android-35/android.jar" ]]; then trex_sdk_dir="$candidate"; break; fi
  done
fi
[[ -f "$trex_sdk_dir/platforms/android-35/android.jar" ]] || die 'Android SDK platform 35 is required; set TREX_ANDROID_SDK.'
[[ -x "$trex_sdk_dir/build-tools/35.0.0/apksigner" ]] || die 'Android SDK build-tools 35.0.0 is required.'
export ANDROID_HOME="$trex_sdk_dir" ANDROID_SDK_ROOT="$trex_sdk_dir"

for local_dir in .gradle-cache .local; do
  [[ ! -L "$android_dir/$local_dir" ]] || die "$local_dir must be a local directory, not a symlink."
  mkdir -p "$android_dir/$local_dir"
done
export GRADLE_USER_HOME="$android_dir/.gradle-cache"
export ANDROID_USER_HOME="$android_dir/.local/android-user"
mkdir -p "$ANDROID_USER_HOME"
trex_read_cache="${TREX_GRADLE_RO_CACHE:-$HOME/.gradle/caches}"
unset GRADLE_RO_DEP_CACHE
if [[ -d "$trex_read_cache/modules-2" ]]; then
  export GRADLE_RO_DEP_CACHE="$trex_read_cache"
fi

trex_gradle_bin="${TREX_GRADLE_BIN:-}"
if [[ -z "$trex_gradle_bin" ]]; then
  for candidate in "$android_dir"/.gradle-cache/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3/bin/gradle \
    "$HOME"/.gradle/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3/bin/gradle; do
    if [[ -x "$candidate" ]]; then trex_gradle_bin="$candidate"; break; fi
  done
fi
if [[ -z "$trex_gradle_bin" ]]; then
  [[ ${#offline_args[@]} == 0 ]] || die 'Gradle 8.14.3 is not cached. Supply TREX_GRADLE_BIN, or use --online to bootstrap the official wrapper.'
  trex_gradle_bin="$android_dir/gradlew"
fi
[[ -x "$trex_gradle_bin" ]] || die 'The selected Gradle executable is unavailable.'

# This is a local debug key, never a release credential or a global keystore.
trex_debug_key="$android_dir/.local/debug.keystore"
[[ ! -L "$trex_debug_key" ]] || die 'The debug keystore must not be a symlink.'
if [[ ! -f "$trex_debug_key" ]]; then
  (
    umask 077
    "$JAVA_HOME/bin/keytool" -genkeypair -noprompt -keystore "$trex_debug_key" \
      -alias androiddebugkey -storepass android -keypass android -keyalg RSA \
      -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=T-Rex Jelly,C=CN'
  )
fi

"$trex_gradle_bin" --project-dir "$android_dir" --no-daemon --console plain \
  "${offline_args[@]}" assembleDebug "$@"
trex_apk="$android_dir/app/build/outputs/apk/debug/app-debug.apk"
[[ -f "$trex_apk" ]] || die 'Gradle did not produce app-debug.apk.'
"$trex_sdk_dir/build-tools/35.0.0/apksigner" verify --verbose "$trex_apk"
printf '\nAndroid APK: %s\n' "$trex_apk"
