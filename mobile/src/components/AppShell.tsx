import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { Images, ScanFace } from 'lucide-react-native';
import { Brand } from './Brand';
import { Avatar } from './ui';
import { COLORS, SPACING } from '../theme/colors';

const TABS = [
  { href: '/family', label: 'Memories', Icon: Images },
  { href: '/companion', label: 'Recognize', Icon: ScanFace },
] as const;

// Mobile equivalent of the web AppShell: slim top header and a floating
// bottom pill navigation between the two modes.
export function AppShell({
  children,
  familyName,
  me,
}: {
  children: ReactNode;
  familyName?: string;
  me?: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const path = usePathname();

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Brand size={24} />
        <Text style={styles.headerFamily} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {familyName ?? 'Your family'}
        </Text>
        <Avatar name={me ?? 'Kin'} size={31} />
      </View>
      <View style={styles.content}>{children}</View>
      <View
        style={[styles.navWrap, { bottom: insets.bottom + 14 }]}
        accessibilityRole="tablist"
        accessibilityLabel="Main navigation"
      >
        <View style={styles.nav}>
          {TABS.map(({ href, label, Icon }) => {
            const active = path === href;
            return (
              <TouchableOpacity
                key={href}
                onPress={() => router.navigate(href)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
                style={[styles.navLink, active && styles.navLinkActive]}
              >
                <Icon
                  size={22}
                  color={active ? COLORS.accent : '#696971'}
                  strokeWidth={1.65}
                />
                <Text
                  style={[styles.navLabel, active && styles.navLabelActive]}
                  maxFontSizeMultiplier={1.3}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    gap: 12,
  },
  headerFamily: {
    flex: 1,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  navWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    alignItems: 'center',
  },
  nav: {
    flexDirection: 'row',
    gap: 3,
    padding: 6,
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'rgba(250,250,250,0.9)',
    borderRadius: 35,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 6,
  },
  navLink: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 55,
    borderRadius: 28,
  },
  navLinkActive: {
    backgroundColor: 'rgba(229,229,235,0.66)',
  },
  navLabel: {
    fontSize: 11,
    color: '#696971',
  },
  navLabelActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
});
