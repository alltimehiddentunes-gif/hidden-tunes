#!/bin/sh
set -eu

TEMPLATE_ROLE="CPTemplateApplicationSceneSessionRoleApplication"
WINDOW_CARPLAY_ROLE="UIWindowSceneSessionRoleCarPlay"
PHONE_ROLE="UIWindowSceneSessionRoleApplication"
TEMPLATE_CLASS="CPTemplateApplicationScene"
PLIST="${TARGET_BUILD_DIR}/${INFOPLIST_PATH}"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

fail() {
  echo "[HTCarPlayManifest] FATAL: $*" >&2
  exit 1
}

plist_value() {
  "$PLIST_BUDDY" -c "Print :UIApplicationSceneManifest:UISceneConfigurations:$1:$2:$3" "$PLIST" 2>/dev/null
}

count_role_entries() {
  role="$1"
  index=0
  while "$PLIST_BUDDY" -c "Print :UIApplicationSceneManifest:UISceneConfigurations:${role}:${index}" "$PLIST" >/dev/null 2>&1; do
    index=$((index + 1))
  done
  echo "$index"
}

test -f "$PLIST" || fail "processed Info.plist not found at $PLIST"

CARPLAY_SDK_ROOT="${SDKROOT}/System/Library/Frameworks/CarPlay.framework"
UIKIT_SDK_ROOT="${SDKROOT}/System/Library/Frameworks/UIKit.framework"
grep -R -q "$TEMPLATE_ROLE" "$CARPLAY_SDK_ROOT/Headers" "$CARPLAY_SDK_ROOT/Modules" 2>/dev/null || \
  fail "$TEMPLATE_ROLE is not declared by the installed CarPlay SDK"
grep -R -q "$PHONE_ROLE" "$UIKIT_SDK_ROOT/Headers" "$UIKIT_SDK_ROOT/Modules" 2>/dev/null || \
  fail "$PHONE_ROLE is not declared by the installed UIKit SDK"

template_count="$(count_role_entries "$TEMPLATE_ROLE")"
phone_count="$(count_role_entries "$PHONE_ROLE")"
window_carplay_count="$(count_role_entries "$WINDOW_CARPLAY_ROLE")"

test "$template_count" -eq 1 || fail "expected exactly one $TEMPLATE_ROLE configuration; found $template_count"
test "$phone_count" -eq 1 || fail "expected exactly one $PHONE_ROLE configuration; found $phone_count"
test "$window_carplay_count" -eq 0 || fail "processed plist must not contain $WINDOW_CARPLAY_ROLE; found $window_carplay_count"

scene_manifest_xml="$("$PLIST_BUDDY" -x -c 'Print :UIApplicationSceneManifest:UISceneConfigurations' "$PLIST")"
scene_role_total="$(printf '%s\n' "$scene_manifest_xml" | grep -E -c '<key>.*SceneSessionRole.*</key>' || true)"
test "$scene_role_total" -eq 2 || fail "processed plist must contain exactly two scene roles; found $scene_role_total"

test "$(plist_value "$TEMPLATE_ROLE" 0 UISceneClassName)" = "$TEMPLATE_CLASS" || \
  fail "$TEMPLATE_ROLE must use $TEMPLATE_CLASS"
test "$(plist_value "$TEMPLATE_ROLE" 0 UISceneConfigurationName)" = "HiddenTunesCarPlay" || \
  fail "$TEMPLATE_ROLE must use HiddenTunesCarPlay"
case "$(plist_value "$TEMPLATE_ROLE" 0 UISceneDelegateClassName)" in
  *.CarPlaySceneDelegate) ;;
  *) fail "$TEMPLATE_ROLE must resolve to PRODUCT_MODULE_NAME.CarPlaySceneDelegate" ;;
esac

test "$(plist_value "$PHONE_ROLE" 0 UISceneClassName)" = "UIWindowScene" || \
  fail "$PHONE_ROLE must remain UIWindowScene"
test "$(plist_value "$PHONE_ROLE" 0 UISceneConfigurationName)" = "HiddenTunesPhone" || \
  fail "$PHONE_ROLE must use HiddenTunesPhone"
case "$(plist_value "$PHONE_ROLE" 0 UISceneDelegateClassName)" in
  *.PhoneSceneDelegate) ;;
  *) fail "$PHONE_ROLE must resolve to PRODUCT_MODULE_NAME.PhoneSceneDelegate" ;;
esac

template_class_total="$("$PLIST_BUDDY" -x -c 'Print :UIApplicationSceneManifest' "$PLIST" | grep -c "<string>${TEMPLATE_CLASS}</string>" || true)"
test "$template_class_total" -eq 1 || \
  fail "expected one non-conflicting $TEMPLATE_CLASS configuration in processed plist; found $template_class_total"

echo "[HTCarPlayManifest] installed SDK constant: $TEMPLATE_ROLE"
echo "[HTCarPlayManifest] processed plist: $PLIST"
printf '%s\n' "$scene_manifest_xml"
echo "[HTCarPlayManifest] validation passed"
