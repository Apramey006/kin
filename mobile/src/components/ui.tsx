import { useEffect, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  Animated,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../theme/colors';
import { initials } from '../fixtures/data';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'outline';

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  full,
  icon,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  full?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: any;
}) {
  const label =
    typeof children === 'string' ? (
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' || variant === 'danger'
            ? styles.buttonTextOnColor
            : variant === 'quiet'
              ? { color: COLORS.accent }
              : { color: COLORS.ink },
          size === 'lg' && { fontSize: 17 },
          size === 'sm' && { fontSize: 13 },
        ]}
        maxFontSizeMultiplier={1.6}
      >
        {children}
      </Text>
    ) : (
      children
    );
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.75}
      style={[
        styles.button,
        size === 'lg' && styles.buttonLg,
        size === 'sm' && styles.buttonSm,
        variant === 'primary' && { backgroundColor: COLORS.accent },
        variant === 'secondary' && { backgroundColor: '#F0F0F2' },
        variant === 'danger' && { backgroundColor: COLORS.danger },
        variant === 'outline' && {
          backgroundColor: COLORS.surface,
          borderWidth: 1,
          borderColor: COLORS.line,
        },
        variant === 'quiet' && { backgroundColor: 'transparent' },
        full && { alignSelf: 'stretch' },
        disabled && { opacity: 0.48 },
        style,
      ]}
    >
      {icon}
      {label}
    </TouchableOpacity>
  );
}

export function Spinner({ color = '#fff', size = 'small' as const }) {
  return <ActivityIndicator color={color} size={size} />;
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const bg =
    kind === 'error'
      ? COLORS.noticeErrorBg
      : kind === 'success'
        ? COLORS.noticeSuccessBg
        : COLORS.noticeBg;
  const fg =
    kind === 'error'
      ? COLORS.noticeErrorInk
      : kind === 'success'
        ? COLORS.noticeSuccessInk
        : COLORS.noticeInk;
  return (
    <View
      style={[styles.notice, { backgroundColor: bg }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={[styles.noticeText, { color: fg }]} maxFontSizeMultiplier={1.6}>
        {children}
      </Text>
    </View>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success';
}) {
  const style =
    tone === 'accent'
      ? { backgroundColor: COLORS.accentSoft, color: COLORS.accent }
      : tone === 'success'
        ? { backgroundColor: '#EDF6EE', color: COLORS.success }
        : { backgroundColor: '#F1F1F3', color: COLORS.muted };
  return (
    <View style={[styles.pill, { backgroundColor: style.backgroundColor }]}>
      <Text style={[styles.pillText, { color: style.color }]} maxFontSizeMultiplier={1.5}>
        {children}
      </Text>
    </View>
  );
}

export function Avatar({
  name,
  size = 32,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color ?? COLORS.avatarBg,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text
        style={[
          styles.avatarText,
          {
            fontSize: size * 0.36,
            color: color ? '#FFFFFF' : COLORS.avatarInk,
          },
        ]}
        maxFontSizeMultiplier={1.4}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <View
      style={styles.segmented}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[styles.segmentText, active && styles.segmentTextActive]}
              maxFontSizeMultiplier={1.4}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Bottom sheet matching the web Sheet on mobile: scrim + rounded top card.
export function Sheet({
  open,
  onClose,
  title,
  children,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      slide.setValue(0);
      Animated.spring(slide, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 4,
        speed: 16,
      }).start();
    }
  }, [open, slide]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [480, 0],
  });

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.scrim}
          onPress={busy ? undefined : onClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY }] },
          ]}
        >
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} maxFontSizeMultiplier={1.5}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={busy}
              style={styles.sheetClose}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={18} color={COLORS.muted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  buttonLg: {
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 23,
    borderRadius: 12,
  },
  buttonSm: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  buttonTextOnColor: {
    color: '#fff',
    fontWeight: '600',
  },
  notice: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.segmented,
    borderRadius: 9,
    padding: 3,
    alignSelf: 'stretch',
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#626269',
  },
  segmentTextActive: {
    color: COLORS.ink,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.sheetScrim,
  },
  sheet: {
    backgroundColor: '#FCFCFD',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
    ...SHADOWS.lg,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 34,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#B7B7BD',
    marginTop: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: COLORS.ink,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8E8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    paddingHorizontal: 22,
    paddingTop: 4,
  },
});
