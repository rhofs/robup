#!/usr/bin/env bash
# Build the Android APK on this server.
#
# The toolchain deliberately lives OUTSIDE the repo, in ~/toolchain: it is ~2GB of JDK and Android
# SDK, it is machine-specific, and the Pterodactyl install script runs `git clean -fd` on every
# re-install. Keeping it out of the working tree means a re-install cannot delete it and it never
# risks being committed. That also means this script is the only record of where it is — if the
# paths below stop matching reality, fix them here rather than exporting them by hand each time.
#
# Two versions matter and neither is the obvious choice:
#   - JDK 21, not 17. Capacitor 7's android library compiles with `sourceCompatibility 21`, and a
#     JDK 17 build fails with the unhelpful "error: invalid source release: 21".
#   - Android SDK 35 with build-tools 35.0.0, matching what the generated Gradle files expect.
set -euo pipefail

JAVA_HOME_DIR="$HOME/toolchain/jdk-21.0.12.1+1"
ANDROID_SDK_DIR="$HOME/toolchain/android-sdk"

if [[ ! -d "$JAVA_HOME_DIR" ]]; then
  echo "No JDK 21 at $JAVA_HOME_DIR." >&2
  echo "Install Temurin 21 there, or point JAVA_HOME_DIR in this script at an existing one." >&2
  exit 1
fi
if [[ ! -d "$ANDROID_SDK_DIR" ]]; then
  echo "No Android SDK at $ANDROID_SDK_DIR." >&2
  echo "Install cmdline-tools there, then: sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'" >&2
  exit 1
fi

export JAVA_HOME="$JAVA_HOME_DIR"
export ANDROID_HOME="$ANDROID_SDK_DIR"
export PATH="$JAVA_HOME/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/android"

# --no-daemon: this server also runs production, and a lingering Gradle daemon holds ~1GB of heap
# between builds for no benefit when builds are this infrequent.
TASK="${1:-assembleDebug}"
./gradlew "$TASK" --no-daemon

case "$TASK" in
  assembleDebug) OUT="app/build/outputs/apk/debug/app-debug.apk" ;;
  assembleRelease) OUT="app/build/outputs/apk/release/app-release-unsigned.apk" ;;
  bundleRelease) OUT="app/build/outputs/bundle/release/app-release.aab" ;;
  *) OUT="" ;;
esac

if [[ -n "$OUT" && -f "$OUT" ]]; then
  echo
  echo "Built: $REPO_ROOT/android/$OUT"
  ls -lh "$OUT" | awk '{print "Size:  " $5}'
fi
