import { memo, useCallback, useEffect, useRef } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../../constants/theme";
import {
  SEARCH_UI_DEBOUNCE_MS,
  createSearchDebounceGate,
} from "../../utils/searchInputTiming";

type DebouncedSearchInputProps = Omit<
  TextInputProps,
  "value" | "onChangeText"
> & {
  value: string;
  onDebouncedChange: (text: string) => void;
  onImmediateChange?: (text: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  debounceMs?: number;
  showClearButton?: boolean;
  onClear?: () => void;
};

function DebouncedSearchInput({
  value,
  onDebouncedChange,
  onImmediateChange,
  containerStyle,
  debounceMs = SEARCH_UI_DEBOUNCE_MS,
  showClearButton = true,
  onClear,
  ...inputProps
}: DebouncedSearchInputProps) {
  const debounceGateRef = useRef(createSearchDebounceGate());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(value);

  latestValueRef.current = value;

  const scheduleDebouncedChange = useCallback(
    (text: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const next = latestValueRef.current;
        const gate = debounceGateRef.current;

        if (!gate.shouldRun(next)) {
          return;
        }

        gate.markSubmitted(next);
        onDebouncedChange(next);
      }, debounceMs);
    },
    [debounceMs, onDebouncedChange]
  );

  const handleChangeText = useCallback(
    (text: string) => {
      onImmediateChange?.(text);
      scheduleDebouncedChange(text);
    },
    [onImmediateChange, scheduleDebouncedChange]
  );

  const handleClear = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    debounceGateRef.current.reset();
    onImmediateChange?.("");
    onDebouncedChange("");
    onClear?.();
  }, [onClear, onDebouncedChange, onImmediateChange]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <View style={[styles.container, containerStyle]}>
      <Ionicons name="search" size={18} color={COLORS.cyan} />

      <TextInput
        {...inputProps}
        value={value}
        onChangeText={handleChangeText}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {showClearButton && value.length > 0 ? (
        <TouchableOpacity activeOpacity={0.78} hitSlop={8} onPress={handleClear}>
          <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default memo(DebouncedSearchInput);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
  },
});
