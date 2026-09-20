import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFixtures, FAMILY_ID } from '../src/fixtures/data';
import type { Relative, GraphNodeRow, MemoryRow, WeaverQuestionRow } from '../src/types';
import { RelativePicker } from '../src/components/family/RelativePicker';
import { PhotoUploader } from '../src/components/family/PhotoUploader';
import { StoryRecorder } from '../src/components/family/StoryRecorder';
import { MemoryList } from '../src/components/family/MemoryList';
import { WeaverInbox } from '../src/components/family/WeaverInbox';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../src/theme/colors';
import { TEXT_STYLES, TYPOGRAPHY } from '../src/theme/typography';

export default function FamilyScreen() {
  const router = useRouter();
  const { relatives, personNodes, memories, weaverQuestions } = useFixtures(true);
  
  const [selectedRelative, setSelectedRelative] = useState<Relative | null>(null);
  const [myMemories, setMyMemories] = useState<MemoryRow[]>([]);
  const [myQuestions, setMyQuestions] = useState<WeaverQuestionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRelative) {
      setMyMemories(memories.filter(m => m.contributor_id === selectedRelative.id));
      setMyQuestions(weaverQuestions.filter(q => q.target_relative_id === selectedRelative.id));
    }
  }, [selectedRelative, memories, weaverQuestions]);

  const handleRelativeSelect = (relative: Relative) => {
    setSelectedRelative(relative);
    setError(null);
  };

  const handleStorySubmit = async (result: { transcript: string; entities: any[] }) => {
    if (!selectedRelative) return;
    
    setBusy(true);
    setError(null);
    
    try {
      // In production, this would call the API
      // const response = await apiClient.uploadStory(file, selectedRelative.id);
      
      // For now, simulate the API call with fixtures
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update local state with the new memory
      const newMemory: MemoryRow = {
        id: `mem-${Date.now()}`,
        family_id: FAMILY_ID,
        contributor_id: selectedRelative.id,
        kind: 'story',
        media_path: null,
        transcript: result.transcript,
        caption: null,
        summary: result.transcript.substring(0, 100) + '...',
        source_question_id: null,
        created_at: new Date().toISOString(),
      };
      
      setMyMemories([newMemory, ...myMemories]);
      Alert.alert('Success', 'Your story has been saved');
    } catch (err) {
      setError('Failed to save story');
      Alert.alert('Error', 'Failed to save your story');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoSubmit = async (result: any) => {
    if (!selectedRelative) return;
    
    setBusy(true);
    setError(null);
    
    try {
      // In production, this would call the API
      // const response = await apiClient.uploadPhoto(file, selectedRelative.id, labels);
      
      // For now, simulate the API call with fixtures
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update local state with the new memory
      const newMemory: MemoryRow = {
        id: `mem-${Date.now()}`,
        family_id: FAMILY_ID,
        contributor_id: selectedRelative.id,
        kind: 'photo',
        media_path: result.media_path,
        transcript: null,
        caption: result.caption,
        summary: result.summary,
        source_question_id: null,
        created_at: new Date().toISOString(),
      };
      
      setMyMemories([newMemory, ...myMemories]);
      Alert.alert('Success', 'Your photo has been saved');
    } catch (err) {
      setError('Failed to save photo');
      Alert.alert('Error', 'Failed to save your photo');
    } finally {
      setBusy(false);
    }
  };

  const handleWeaverAnswer = async (questionId: string, result: any) => {
    if (!selectedRelative) return;
    
    setBusy(true);
    setError(null);
    
    try {
      // In production, this would call the API
      // const response = await apiClient.submitWeaverAnswer(questionId, file, selectedRelative.id);
      
      // For now, simulate the API call with fixtures
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Remove the answered question from the list
      setMyQuestions(myQuestions.filter(q => q.id !== questionId));
      Alert.alert('Success', 'Your answer has been saved');
    } catch (err) {
      setError('Failed to save answer');
      Alert.alert('Error', 'Failed to save your answer');
    } finally {
      setBusy(false);
    }
  };

  if (!selectedRelative) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Who are you?</Text>
        <RelativePicker
          relatives={relatives}
          onSelect={handleRelativeSelect}
        />
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessible={true}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hi, <Text style={{ color: selectedRelative.color }}>{selectedRelative.name}</Text>
          </Text>
          <Text style={styles.relation}>{selectedRelative.relation_to_wearer}</Text>
        </View>
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setSelectedRelative(null)}
          accessible={true}
          accessibilityLabel={`Not ${selectedRelative.name}?`}
          accessibilityRole="button"
        >
          <Text style={styles.switchButtonText}>Not {selectedRelative.name}?</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <WeaverInbox
        questions={myQuestions}
        onAnswer={handleWeaverAnswer}
        busy={busy}
      />

      <PhotoUploader
        contributorId={selectedRelative.id}
        personNodes={personNodes}
        onSubmit={handlePhotoSubmit}
        busy={busy}
      />

      <StoryRecorder
        onSubmit={handleStorySubmit}
        busy={busy}
      />

      <MemoryList
        memories={myMemories}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  title: {
    ...TEXT_STYLES.h1,
    color: COLORS.ink,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    marginTop: SPACING.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  greeting: {
    ...TEXT_STYLES.h2,
    color: COLORS.ink,
  },
  relation: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
    marginTop: SPACING.xs,
  },
  switchButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.inkLightest,
    borderRadius: BORDER_RADIUS.sm,
  },
  switchButtonText: {
    ...TEXT_STYLES.label,
    color: COLORS.inkLight,
  },
  backButton: {
    marginTop: SPACING.xxl,
    padding: SPACING.lg,
    backgroundColor: COLORS.inkLightest,
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'center',
    minWidth: 200,
    alignItems: 'center',
  },
  backButtonText: {
    ...TEXT_STYLES.body,
    color: COLORS.ink,
    fontWeight: TYPOGRAPHY.weights.semibold,
  },
  errorContainer: {
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: '#FFEBEE',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    ...TEXT_STYLES.body,
    color: '#D32F2F',
  },
});
