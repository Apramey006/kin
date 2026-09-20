import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import {
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Trash2,
  Play,
  Pause,
} from 'lucide-react-native';
import type { MemoryRow, Relative } from '../types';
import { relativeTime } from '../fixtures/data';
import { Avatar } from './ui';
import { COLORS } from '../theme/colors';

// Memory card matching the web .memory-card: photo on top, then contributor
// meta, quote/caption, kind pill, and a quiet delete affordance for your own.
export function MemoryCard({
  memory,
  owner,
  mine,
  onDelete,
  playingUri,
  onToggleAudio,
}: {
  memory: MemoryRow;
  owner: Relative | undefined;
  mine: boolean;
  onDelete?: (m: MemoryRow) => void;
  playingUri?: string | null;
  onToggleAudio?: (m: MemoryRow) => void;
}) {
  const kindLabel =
    memory.kind === 'answer'
      ? 'A missing piece'
      : memory.kind === 'photo'
        ? 'A familiar moment'
        : 'In their words';
  const KindIcon =
    memory.kind === 'photo' ? ImageIcon : memory.kind === 'answer' ? MessageCircle : Mic;
  const kindA11y =
    memory.kind === 'photo' ? 'Photo' : memory.kind === 'answer' ? 'Answer' : 'Voice memory';

  const imageSource =
    typeof memory.mediaUrl === 'number'
      ? memory.mediaUrl
      : memory.mediaUrl
        ? { uri: memory.mediaUrl }
        : null;

  return (
    <View style={styles.card}>
      {memory.kind === 'photo' &&
        (imageSource ? (
          <Image source={imageSource} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <ImageIcon size={30} color="#9797A1" strokeWidth={1.2} />
          </View>
        ))}
      <View style={styles.content}>
        <View style={styles.meta}>
          <Avatar name={owner?.name ?? 'Family'} size={26} color={owner?.color} />
          <View style={styles.metaText}>
            <Text style={styles.owner} numberOfLines={1}>
              {owner?.name ?? 'Your family'}
              {mine ? ' · You' : ''}
            </Text>
            <Text style={styles.time}>{relativeTime(memory.created_at)}</Text>
          </View>
          <KindIcon
            size={15}
            color={COLORS.muted}
            accessibilityLabel={kindA11y}
            style={styles.kindIcon}
          />
        </View>
        {memory.transcript ? (
          <Text style={styles.quote} maxFontSizeMultiplier={1.6}>
            “{memory.transcript}”
          </Text>
        ) : (
          <Text style={styles.caption} maxFontSizeMultiplier={1.6}>
            {memory.caption || memory.summary}
          </Text>
        )}
        {memory.mediaUrl && memory.kind !== 'photo' && (
          <TouchableOpacity
            style={styles.audioRow}
            onPress={() => onToggleAudio?.(memory)}
            accessibilityRole="button"
            accessibilityLabel={`Listen to ${owner?.name ?? 'your relative'}’s memory`}
          >
            {playingUri === memory.id ? (
              <Pause size={16} color={COLORS.accent} />
            ) : (
              <Play size={16} color={COLORS.accent} />
            )}
            <Text style={styles.audioText}>
              {playingUri === memory.id ? 'Playing…' : 'Listen'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.actions}>
          <Text style={styles.kindPill}>{kindLabel}</Text>
          {mine && (
            <TouchableOpacity
              onPress={() => onDelete?.(memory)}
              accessibilityRole="button"
              accessibilityLabel={`Delete memory: ${memory.summary}`}
              style={styles.deleteBtn}
              hitSlop={8}
            >
              <Trash2 size={16} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  imagePlaceholder: {
    backgroundColor: '#EDEDF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 14,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
  },
  owner: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.ink,
  },
  time: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
  },
  kindIcon: {
    marginLeft: 'auto',
  },
  quote: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: COLORS.ink,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    color: '#57575D',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    minHeight: 40,
  },
  audioText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.accent,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  kindPill: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '500',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
});
