import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Check, Camera } from 'lucide-react-native';
import type { GraphNodeRow } from '../types';
import { Button, Notice, Spinner } from './ui';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme/colors';

export interface PhotoDraft {
  uri: string;
  caption: string;
  labels: {
    person_node_id?: string;
    new_person?: { name: string; relation_to_wearer: string };
  }[];
  personLabel: string;
}

type PersonChoice = { kind: 'existing'; nodeId: string } | { kind: 'new' } | { kind: 'skip' } | null;

// Mirrors the web PhotoUploader: choose a photo, label the face, consent, save.
// Face detection is simulated in fixture mode (one face region per photo).
export function PhotoUploader({
  personNodes,
  onSubmit,
  busy,
}: {
  personNodes: GraphNodeRow[];
  onSubmit: (draft: PhotoDraft) => void | Promise<void>;
  busy: boolean;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  const [choice, setChoice] = useState<PersonChoice>(null);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [caption, setCaption] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulateDetection = (uri: string) => {
    setDetecting(true);
    setFaceCount(0);
    setChoice(null);
    // Fixture mode: after a beat, report one detected face to label.
    setTimeout(() => {
      setFaceCount(1);
      setDetecting(false);
    }, 900);
  };

  const pickFromLibrary = async () => {
    setError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('Photo library access is turned off. Allow it in Settings, then try again.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setConsent(false);
      setCaption('');
      simulateDetection(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    setError(null);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('Camera access is turned off. Allow it in Settings, then try again.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setConsent(false);
      setCaption('');
      simulateDetection(result.assets[0].uri);
    }
  };

  const personLabel =
    choice?.kind === 'existing'
      ? personNodes.find((n) => n.id === choice.nodeId)?.label ?? 'a family member'
      : choice?.kind === 'new'
        ? newName.trim() || 'a new person'
        : '';

  const valid =
    !!image &&
    consent &&
    (choice?.kind === 'skip' ||
      (choice?.kind === 'existing' && !!choice.nodeId) ||
      (choice?.kind === 'new' && !!newName.trim() && !!newRelation.trim()));

  const submit = async () => {
    if (!image || !valid) return;
    const labels =
      choice?.kind === 'existing'
        ? [{ person_node_id: choice.nodeId }]
        : choice?.kind === 'new'
          ? [
              {
                new_person: {
                  name: newName.trim(),
                  relation_to_wearer: newRelation.trim(),
                },
              },
            ]
          : [];
    await onSubmit({ uri: image, caption: caption.trim(), labels, personLabel });
  };

  return (
    <View>
      <Text style={styles.intro}>
        Choose a photo and label the person in it. Kin uses labeled faces to
        recognize them later.
      </Text>

      {!image ? (
        <View style={styles.uploadArea}>
          <ImagePlus size={30} color={COLORS.accent} strokeWidth={1.6} />
          <Text style={styles.uploadTitle}>Choose a familiar photo</Text>
          <Text style={styles.uploadSub}>One clear face works best.</Text>
          <View style={styles.uploadActions}>
            <Button variant="secondary" onPress={pickFromLibrary} disabled={busy}>
              Photo library
            </Button>
            <Button
              variant="secondary"
              onPress={takePhoto}
              disabled={busy}
              icon={<Camera size={17} color={COLORS.ink} />}
            >
              Take photo
            </Button>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.previewWrap}>
            <Image source={{ uri: image }} style={styles.preview} resizeMode="cover" />
            {faceCount > 0 && (
              <View style={styles.faceBox} accessibilityElementsHidden importantForAccessibility="no">
                <View style={styles.faceBoxTag}>
                  <Text style={styles.faceBoxTagText}>1</Text>
                </View>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={pickFromLibrary} disabled={busy} accessibilityRole="button">
            <Text style={styles.changePhoto}>Choose a different photo</Text>
          </TouchableOpacity>
        </>
      )}

      {detecting && (
        <Notice>
          <View style={styles.rowCenter}>
            <Spinner color={COLORS.noticeInk} />
            <Text style={styles.noticeInline}>Finding the faces in your photo…</Text>
          </View>
        </Notice>
      )}

      {image && !detecting && faceCount > 0 && (
        <View style={styles.faceLabel}>
          <Text style={styles.faceLabelTitle}>Person 1</Text>
          <Text style={styles.fieldLabel}>Who is this?</Text>
          <ScrollView style={styles.personList} nestedScrollEnabled>
            {personNodes.map((p) => {
              const selected = choice?.kind === 'existing' && choice.nodeId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => setChoice({ kind: 'existing', nodeId: p.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${p.label}${p.relation_to_wearer ? `, ${p.relation_to_wearer}` : ''}`}
                >
                  <View style={[styles.radio, selected && styles.radioOn]} />
                  <Text style={styles.personRowText}>
                    {p.label}
                    {p.relation_to_wearer && p.relation_to_wearer !== 'self'
                      ? ` · ${p.relation_to_wearer}`
                      : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {(
              [
                { kind: 'new' as const, label: 'Add someone new' },
                { kind: 'skip' as const, label: 'Do not recognize this person' },
              ]
            ).map((opt) => {
              const selected = choice?.kind === opt.kind;
              return (
                <TouchableOpacity
                  key={opt.kind}
                  style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => setChoice(opt.kind === 'new' ? { kind: 'new' } : { kind: 'skip' })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                >
                  <View style={[styles.radio, selected && styles.radioOn]} />
                  <Text style={styles.personRowText}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {choice?.kind === 'new' && (
            <View style={styles.newPerson}>
              <Text style={styles.fieldLabel}>Their name</Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Nora"
                maxLength={80}
                editable={!busy}
                accessibilityLabel="Their name"
              />
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                Relationship to your loved one
              </Text>
              <TextInput
                style={styles.input}
                value={newRelation}
                onChangeText={setNewRelation}
                placeholder="e.g. sister"
                maxLength={60}
                editable={!busy}
                accessibilityLabel="Relationship to your loved one"
              />
            </View>
          )}
        </View>
      )}

      {image && !detecting && (
        <>
          <Text style={styles.fieldLabel}>
            Caption <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.captionInput]}
            value={caption}
            onChangeText={setCaption}
            placeholder="Who, where, or what makes this moment special?"
            maxLength={1000}
            multiline
            editable={!busy}
            accessibilityLabel="Caption"
          />
          <TouchableOpacity
            style={styles.consent}
            onPress={() => setConsent(!consent)}
            disabled={busy}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            accessibilityLabel="Consent to share this photo and use the labeled faces for recognition"
          >
            <View style={[styles.checkbox, consent && styles.checkboxOn]}>
              {consent && <Check size={14} color="#fff" strokeWidth={3} />}
            </View>
            <Text style={styles.consentText}>
              I have permission to share this photo and use the labeled faces
              for our family’s recognition.
            </Text>
          </TouchableOpacity>
          <Button
            size="lg"
            full
            onPress={submit}
            disabled={!valid || busy || detecting}
            icon={busy ? <Spinner /> : <Check size={17} color="#fff" />}
            style={{ marginTop: 18 }}
          >
            {busy ? 'Saving your photo…' : 'Save photo'}
          </Button>
        </>
      )}

      {error && <Notice kind="error">{error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 20,
  },
  uploadArea: {
    backgroundColor: '#F0F0F3',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 18,
    gap: 8,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.ink,
  },
  uploadSub: {
    fontSize: 12,
    color: COLORS.muted,
  },
  uploadActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: '#E8E8EC',
  },
  faceBox: {
    position: 'absolute',
    top: '18%',
    left: '30%',
    width: '40%',
    height: '46%',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 8,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  faceBoxTag: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  faceBoxTagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  changePhoto: {
    color: COLORS.accent,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    minHeight: 44,
    textAlignVertical: 'center',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeInline: {
    color: COLORS.noticeInk,
    fontSize: 14,
  },
  faceLabel: {
    backgroundColor: '#F2F2F5',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  faceLabelTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.ink,
    marginBottom: 7,
  },
  optional: {
    color: COLORS.muted,
    fontWeight: '400',
    fontSize: 12,
  },
  personList: {
    maxHeight: 210,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#fff',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  personRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#A9A9AE',
    backgroundColor: '#fff',
  },
  radioOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
    borderWidth: 6,
  },
  personRowText: {
    fontSize: 14,
    color: COLORS.ink,
    flex: 1,
  },
  newPerson: {
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#A9A9AE',
    borderRadius: 10,
    backgroundColor: '#fff',
    color: COLORS.ink,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    minHeight: 48,
  },
  captionInput: {
    minHeight: 76,
    textAlignVertical: 'top',
    marginTop: 0,
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 18,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#A9A9AE',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.ink,
    lineHeight: 19,
  },
});
