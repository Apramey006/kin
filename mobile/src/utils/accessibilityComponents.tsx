import { Text, TouchableOpacity } from 'react-native';
import { useScaledFontSize, ensureTouchTargetSize, MIN_TOUCH_TARGET } from './accessibility';

// Large text component that respects font scaling
export function AccessibleText({
  children,
  style,
  size = 16,
  ...props
}: {
  children: React.ReactNode;
  style?: any;
  size?: number;
  [key: string]: any;
}) {
  const scaledSize = useScaledFontSize(size);
  
  return (
    <Text
      style={[
        {
          fontSize: scaledSize,
          lineHeight: scaledSize * 1.4,
        },
        style,
      ]}
      allowFontScaling={true}
      maxFontSizeMultiplier={2}
      {...props}
    >
      {children}
    </Text>
  );
}

// Accessible button with proper touch targets
export function AccessibleButton({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  style,
  minimumHeight = MIN_TOUCH_TARGET,
  ...props
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'menuitem' | 'link';
  style?: any;
  minimumHeight?: number;
  [key: string]: any;
}) {
  const scaledMinHeight = ensureTouchTargetSize(minimumHeight);
  
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: disabled }}
      style={[
        {
          minHeight: scaledMinHeight,
          justifyContent: 'center',
          alignItems: 'center',
        },
        style,
      ]}
      {...props}
    >
      {typeof children === 'string' ? (
        <AccessibleText size={16}>{children}</AccessibleText>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}

// Re-export utility functions for convenience
export {
  useScaledFontSize,
  ensureTouchTargetSize,
  MIN_TOUCH_TARGET,
  useScreenReader,
  useReduceMotion,
  useHighContrast,
  announceForAccessibility,
  setAccessibilityFocus,
  generateAccessibleDescription,
  formatTimeForAccessibility,
  formatDateForAccessibility,
} from './accessibility';
