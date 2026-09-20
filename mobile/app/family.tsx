import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Plus,
  ImagePlus,
  Mic,
  ArrowRight,
  Images,
  Heart,
  LockKeyhole,
} from 'lucide-react-native';
import { AppShell } from '../src/components/AppShell';
import { Sheet, Button, Notice, Segmented, Avatar } from '../src/components/ui';
import { MemoryCard } from '../src/components/MemoryCard';
import { PhotoUploader, type PhotoDraft } from '../src/components/PhotoUploader';
import { Recorder } from '../src/components/Recorder';
import { WeaverInbox } from '../src/components/WeaverInbox';
import { useAudioPlayerAdapter, type RecordingResult } from '../src/adapters/audio';
import {
  useFixtures,
  FAMILY_ID,
  fixtureWearer,
} from '../src/fixtures/data';
import type { MemoryRow, Relative, WeaverQuestionRow } from '../src/types';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme/colors';

type Filter = 'all' | 'photos' | 'stories' | 'mine';
type Compose = 'choose' | 'photo' | 'story' | null;

// Mirrors the web /family Memories screen.
export default function FamilyScreen() {
  const { relatives, personNodes, memories: seedMemories, weaverQuestions: seedQuestions } =
    useFixtures(true);

  const [me, setMe] = useState<Relative>(relatives[0]);
  const [memories, setMemories] = useState<MemoryRow[]>(seedMemories);
  const [questions, setQuestions] = useState<WeaverQuestionRow[]>(seedQuestions);
  const [compose, setCompose] = useState<Compose>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<MemoryRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { isPlaying, playUri, stopAudio } = useAudioPlayerAdapter();

  const filtered = useMemo(
    () =>
      memories.filter(
        (m) =>
          filter === 'all' ||
          (filter === 'mine' && m.contributor_id === me.id) ||
          (filter === 'photos' && m.kind === 'photo') ||
          (filter === 'stories' && m.kind !== 'photo'),
      ),
    [memories, filter, me.id],
  );

  const toggleAudio = (m: MemoryRow) => {
    if (playingId === m.id && isPlaying) {
      stopAudio();
      setPlayingId(null);
      return;
    }
    const uri = typeof m.mediaUrl === 'string' ? m.mediaUrl : null;
    if (uri) {
      playUri(uri);
      setPlayingId(m.id);
    }
  };

  const addMemory = (partial: Omit<MemoryRow, 'id' | 'family_id' | 'contributor_id' | 'created_at'>) => {
    const memory: MemoryRow = {
      ...partial,
      id: `mem-${Date.now()}`,
      family_id: FAMILY_ID,
      contributor_id: me.id,
      created_at: new Date().toISOString(),
    };
    setMemories((current) => [memory, ...current]);
    return memory;
  };

  const saveStory = async (result: RecordingResult) => {
    setBusy(true);
    try {
      // Fixture mode: keep the recording locally so it can be played back.
      // With a backend configured this posts to /api/memories/story.
      await new Promise((r) => setTimeout(r, 600));
      addMemory({
        kind: 'story',
        media_path: result.uri,
        mediaUrl: result.uri,
        transcript: null,
        caption: null,
        summary: `A voice memory from ${me.name}`,
        source_question_id: null,
      });
      setCompose(null);
      setNotice('Voice memory saved.');
    } finally {
      setBusy(false);
    }
    return true;
  };

  const savePhoto = async (draft: PhotoDraft) => {
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      addMemory({
        kind: 'photo',
        media_path: draft.uri,
        mediaUrl: draft.uri,
        transcript: null,
        caption: draft.caption || `A photo of ${draft.personLabel}`,
        summary: draft.caption || `A photo of ${draft.personLabel}`,
        source_question_id: null,
      });
      setCompose(null);
      setNotice('Your photo is now part of your family’s memories.');
    } finally {
      setBusy(false);
    }
  };

  const answerQuestion = async (questionId: string, result: RecordingResult) => {
    await new Promise((r) => setTimeout(r, 600));
    setQuestions((current) =>
      current.map((q) => (q.id === questionId ? { ...q, status: 'answered' } : q)),
    );
    addMemory({
      kind: 'answer',
      media_path: result.uri,
      mediaUrl: result.uri,
      transcript: null,
      caption: null,
      summary: `An answer from ${me.name}`,
      source_question_id: questionId,
    });
  };

  const removeMemory = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 400));
      setMemories((current) => current.filter((m) => m.id !== deleting.id));
      setDeleting(null);
      setNotice('Memory and its upload deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell familyName={`${fixtureWearer.name}’s family`} me={me.name}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <View style={styles.headerText}>
            <Text style={styles.h1} maxFontSizeMultiplier={1.4}>
              Memories
            </Text>
            <Text style={styles.headerSub}>{fixtureWearer.name}’s family library</Text>
          </View>
          <Button
            size="sm"
            onPress={() => setCompose('choose')}
            icon={<Plus size={16} color="#fff" />}
          >
            Add
          </Button>
        </View>

        {notice && <Notice kind="success">{notice}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        <Text style={styles.sharingAsLabel}>You’re sharing as</Text>
        <View style={styles.sharingAs}>
          {relatives.map((r) => {
            const active = r.id === me.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.shareChip, active && styles.shareChipActive]}
                onPress={() => setMe(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Share as ${r.name}, ${r.relation_to_wearer}`}
              >
                <Avatar name={r.name} size={26} color={active ? r.color : undefined} />
                <Text style={[styles.shareChipText, active && styles.shareChipTextActive]}>
                  {r.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <WeaverInbox
          me={me}
          relatives={relatives}
          questions={questions}
          onAnswered={answerQuestion}
        />

        <Segmented<Filter>
          label="Filter memories"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'photos', label: 'Photos' },
            { value: 'stories', label: 'Stories' },
            { value: 'mine', label: 'By you' },
          ]}
        />

        {filtered.length ? (
          <View style={styles.grid}>
            {filtered.map((m) => (
              <View style={styles.gridItem} key={m.id}>
                <MemoryCard
                  memory={m}
                  owner={relatives.find((r) => r.id === m.contributor_id)}
                  mine={m.contributor_id === me.id}
                  onDelete={setDeleting}
                  playingUri={playingId}
                  onToggleAudio={toggleAudio}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyStack} accessibilityElementsHidden importantForAccessibility="no">
              <View style={[styles.emptyPhoto, styles.emptyPhotoLeft]} />
              <View style={[styles.emptyPhoto, styles.emptyPhotoRight]} />
              <View style={[styles.emptyPhoto, styles.emptyPhotoTop]}>
                <Images size={38} color="#9797A1" strokeWidth={1.1} />
              </View>
            </View>
            <Text style={styles.emptyTitle}>
              {memories.length ? 'No memories in this view' : 'Your memories belong here.'}
            </Text>
            <Text style={styles.emptyBody}>
              {memories.length
                ? 'Choose a different view, or add a memory.'
                : `Add a photo or record a story for ${fixtureWearer.name}. Your family can add theirs, too.`}
            </Text>
            <Button variant="secondary" onPress={() => setCompose('choose')}>
              {memories.length ? 'Add a memory' : 'Add your first memory'}
            </Button>
          </View>
        )}

        {!!memories.length && (
          <Text style={styles.libraryCount}>
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'} · Shared with{' '}
            {relatives.length} {relatives.length === 1 ? 'person' : 'people'}
          </Text>
        )}

        <View style={styles.privacy}>
          <LockKeyhole size={13} color={COLORS.muted} />
          <Text style={styles.privacyText}>
            Only people in your family can see these memories.
          </Text>
        </View>
      </ScrollView>

      <Sheet
        open={!!compose}
        onClose={() => setCompose(null)}
        busy={busy}
        title={
          compose === 'photo'
            ? 'Add photo'
            : compose === 'story'
              ? 'Record a memory'
              : 'Add a memory'
        }
      >
        {compose === 'choose' ? (
          <>
            <Text style={styles.sheetIntro}>Choose a photo or record a story.</Text>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => setCompose('photo')}
              accessibilityRole="button"
              accessibilityLabel="A photo — label the people in a family photo"
            >
              <ImagePlus size={26} color={COLORS.accent} strokeWidth={1.6} />
              <View style={styles.choiceText}>
                <Text style={styles.choiceTitle}>A photo</Text>
                <Text style={styles.choiceSub}>Label the people in a family photo.</Text>
              </View>
              <ArrowRight size={16} color={COLORS.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => setCompose('story')}
              accessibilityRole="button"
              accessibilityLabel="A voice memory — record a story in your own words"
            >
              <Mic size={26} color={COLORS.accent} strokeWidth={1.6} />
              <View style={styles.choiceText}>
                <Text style={styles.choiceTitle}>A voice memory</Text>
                <Text style={styles.choiceSub}>Record a story in your own words.</Text>
              </View>
              <ArrowRight size={16} color={COLORS.muted} />
            </TouchableOpacity>
          </>
        ) : compose === 'photo' ? (
          <PhotoUploader
            personNodes={personNodes}
            busy={busy}
            onSubmit={savePhoto}
          />
        ) : compose === 'story' ? (
          <>
            <Text style={styles.sheetIntro}>
              Say who you’re remembering and a little thing that makes them special.
            </Text>
            <Recorder label="Record a memory" onRecorded={saveStory} disabled={busy} />
          </>
        ) : null}
      </Sheet>

      <Sheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this memory?"
        busy={busy}
      >
        <Text style={styles.sheetIntro}>
          Its photo or recording and face labels will be removed, too. Other
          family memories will stay. This can’t be undone.
        </Text>
        {error && <Notice kind="error">{error}</Notice>}
        <View style={styles.confirmRow}>
          <Button
            variant="outline"
            onPress={() => setDeleting(null)}
            disabled={busy}
            style={{ flex: 1 }}
          >
            Keep memory
          </Button>
          <Button
            variant="danger"
            onPress={removeMemory}
            disabled={busy}
            style={{ flex: 1 }}
          >
            {busy ? 'Deleting…' : 'Delete memory'}
          </Button>
        </View>
      </Sheet>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 120,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  h1: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -1,
    color: COLORS.ink,
  },
  headerSub: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 6,
  },
  sharingAsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    marginTop: 14,
    marginBottom: 8,
  },
  sharingAs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    minHeight: 44,
  },
  shareChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  shareChipText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },
  shareChipTextActive: {
    color: COLORS.ink,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 22,
  },
  gridItem: {
    width: '47.5%',
    flexGrow: 1,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyStack: {
    width: 116,
    height: 110,
    marginBottom: 30,
  },
  emptyPhoto: {
    position: 'absolute',
    top: 3,
    left: 10,
    right: 10,
    bottom: 12,
    borderRadius: 13,
    backgroundColor: '#FAFAFB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyPhotoLeft: {
    transform: [{ rotate: '-13deg' }, { translateX: -10 }, { translateY: -2 }],
  },
  emptyPhotoRight: {
    backgroundColor: '#EDEDF1',
    transform: [{ rotate: '10deg' }, { translateX: 13 }, { translateY: 1 }],
  },
  emptyPhotoTop: {
    backgroundColor: '#FDFDFE',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 9 },
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: COLORS.ink,
  },
  emptyBody: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    maxWidth: 335,
    marginVertical: 14,
    lineHeight: 22,
  },
  libraryCount: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 28,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 28,
  },
  privacyText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  sheetIntro: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 20,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E2E5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    minHeight: 84,
  },
  choiceText: {
    flex: 1,
    minWidth: 0,
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.ink,
  },
  choiceSub: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 3,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
  },
});
