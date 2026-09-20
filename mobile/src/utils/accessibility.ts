import { useWindowDimensions, Platform } from 'react-native';
import { useState, useEffect } from 'react';

// Typography scaling for accessibility
export function useScaledFontSize(baseSize: number): number {
  const { fontScale } = useWindowDimensions();
  // Scale font size based on device font scale settings, but cap at reasonable limits
  const scaledSize = baseSize * Math.min(fontScale, 1.5);
  return Math.round(scaledSize);
}

// Responsive spacing based on screen size
export function useResponsiveSpacing(baseSpacing: number): number {
  const { width } = useWindowDimensions();
  const scale = width < 375 ? 0.85 : width > 414 ? 1.15 : 1;
  return baseSpacing * scale;
}

// Minimum touch target size (44pt as per iOS guidelines, 48dp as per Android)
export const MIN_TOUCH_TARGET = 44;

// Ensure touch targets meet accessibility guidelines
export function ensureTouchTargetSize(size: number): number {
  return Math.max(size, MIN_TOUCH_TARGET);
}

// Screen reader detection (simplified version without external dependency)
export function useScreenReader(): boolean {
  // This is a placeholder - in production you might want to add
  // react-native-accessibility-info or use platform-specific APIs
  const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);

  useEffect(() => {
    // Placeholder implementation
    // In production, you would use the actual accessibility info API
    setIsScreenReaderEnabled(false);
  }, []);

  return isScreenReaderEnabled;
}

// Reduce motion detection (simplified version)
export function useReduceMotion(): boolean {
  // This is a placeholder - in production you might want to add
  // react-native-accessibility-info or use platform-specific APIs
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    // Placeholder implementation
    // In production, you would use the actual accessibility info API
    setReduceMotionEnabled(false);
  }, []);

  return reduceMotionEnabled;
}

// High contrast mode detection (simplified version)
export function useHighContrast(): boolean {
  // This is a placeholder - in production you might want to add
  // react-native-accessibility-info or use platform-specific APIs
  const [highContrastEnabled, setHighContrastEnabled] = useState(false);

  useEffect(() => {
    // Placeholder implementation
    // In production, you would use the actual accessibility info API
    setHighContrastEnabled(false);
  }, []);

  return highContrastEnabled;
}

// Announce messages to screen readers (placeholder)
export function announceForAccessibility(message: string): void {
  // This is a placeholder - in production you would use the actual accessibility info API
  console.log('Accessibility announcement:', message);
}

// Focus management for screen readers
export function setAccessibilityFocus(ref: React.RefObject<any>): void {
  if (ref.current) {
    ref.current.setNativeProps({
      accessible: true,
      accessibilityLabel: ref.current.props.accessibilityLabel,
    });
    // On Android, we can request focus
    if (Platform.OS === 'android') {
      ref.current.focus();
    }
  }
}

// Generate accessible descriptions for complex UI elements
export function generateAccessibleDescription(
  action: string,
  object: string,
  state?: string
): string {
  let description = `${action} ${object}`;
  if (state) {
    description += `, ${state}`;
  }
  return description;
}

// Time formatting for accessibility (e.g., "2 minutes 30 seconds" instead of "2:30")
export function formatTimeForAccessibility(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

// Date formatting for accessibility
export function formatDateForAccessibility(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString(undefined, options);
}
