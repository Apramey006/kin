import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createError, handleAppError, ErrorCodes } from '../../utils/errorHandling';
import type { GraphNodeRow, FaceLabel } from '../../types';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../theme/colors';
import { TEXT_STYLES, TYPOGRAPHY } from '../../theme/typography';

interface PhotoUploaderProps {
  contributorId: string;
  personNodes: GraphNodeRow[];
  onSubmit: (result: any) => void;
  busy: boolean;
}

export function PhotoUploader({ contributorId, personNodes, onSubmit, busy }: PhotoUploaderProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRelation, setNewPersonRelation] = useState('');
  const [isAddingNewPerson, setIsAddingNewPerson] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        throw createError(
          'PHOTO_LIBRARY_PERMISSION_DENIED',
          'Photo library permission not granted',
          'Photo library permission is required to select photos'
        );
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      const userMessage = handleAppError(error);
      Alert.alert('Error', userMessage);
    }
  };

  const handleSubmit = async () => {
    if (!selectedImage) {
      Alert.alert('Photo Required', 'Please select a photo first');
      return;
    }

    if (!hasConsent) {
      Alert.alert('Consent Required', 'Please confirm you have permission to add this person\'s photo');
      return;
    }

    if (!selectedPerson && !isAddingNewPerson) {
      Alert.alert('Person Required', 'Please select or add a person');
      return;
    }

    if (isAddingNewPerson && (!newPersonName || !newPersonRelation)) {
      Alert.alert('Information Required', 'Please provide the person\'s name and relationship');
      return;
    }

    const labels: FaceLabel[] = [];
    
    if (isAddingNewPerson) {
      labels.push({
        new_person: {
          name: newPersonName,
          relation_to_wearer: newPersonRelation,
        },
      });
    } else if (selectedPerson) {
      labels.push({
        person_node_id: selectedPerson,
      });
    }

    try {
      // In production, this would upload the actual file
      // For now, we'll simulate the upload
      const result = {
        media_path: selectedImage,
        caption: 'A family photo',
        summary: `Photo of ${isAddingNewPerson ? newPersonName : personNodes.find(n => n.id === selectedPerson)?.label}`,
        labels,
      };

      onSubmit(result);
      
      // Reset form
      setSelectedImage(null);
      setSelectedPerson(null);
      setNewPersonName('');
      setNewPersonRelation('');
      setIsAddingNewPerson(false);
      setHasConsent(false);
    } catch (error) {
      const userMessage = handleAppError(error);
      Alert.alert('Error', userMessage);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add a photo</Text>
      
      <TouchableOpacity
        style={styles.imagePicker}
        onPress={pickImage}
        disabled={busy}
        accessible={true}
        accessibilityLabel="Select photo from library"
        accessibilityRole="button"
        accessibilityHint="Opens photo library to choose a picture"
      >
        {selectedImage ? (
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Tap to select photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.personSelection}>
        <TouchableOpacity
          style={[styles.optionButton, !isAddingNewPerson && styles.selectedOption]}
          onPress={() => setIsAddingNewPerson(false)}
          disabled={busy}
          accessible={true}
          accessibilityLabel="Select existing person"
          accessibilityRole="radio"
          accessibilityState={{ selected: !isAddingNewPerson }}
        >
          <Text style={styles.optionText}>Select existing person</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.optionButton, isAddingNewPerson && styles.selectedOption]}
          onPress={() => setIsAddingNewPerson(true)}
          disabled={busy}
          accessible={true}
          accessibilityLabel="Add new person"
          accessibilityRole="radio"
          accessibilityState={{ selected: isAddingNewPerson }}
        >
          <Text style={styles.optionText}>Add new person</Text>
        </TouchableOpacity>
      </View>

      {!isAddingNewPerson ? (
        <View style={styles.existingPersonList}>
          {personNodes.map((person) => (
            <TouchableOpacity
              key={person.id}
              style={[styles.personItem, selectedPerson === person.id && styles.selectedPerson]}
              onPress={() => setSelectedPerson(person.id)}
              disabled={busy}
              accessible={true}
              accessibilityLabel={`${person.label}, ${person.relation_to_wearer || ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedPerson === person.id }}
            >
              <Text style={styles.personName}>{person.label}</Text>
              {person.relation_to_wearer && (
                <Text style={styles.personRelation}>{person.relation_to_wearer}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.newPersonForm}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={newPersonName}
            onChangeText={setNewPersonName}
            placeholder="Enter name"
            editable={!busy}
            accessible={true}
            accessibilityLabel="Person name"
            accessibilityHint="Enter the name of the person in the photo"
          />
          
          <Text style={styles.label}>Relationship to wearer</Text>
          <TextInput
            style={styles.input}
            value={newPersonRelation}
            onChangeText={setNewPersonRelation}
            placeholder="e.g., granddaughter, son"
            editable={!busy}
            accessible={true}
            accessibilityLabel="Relationship to wearer"
            accessibilityHint="Enter how this person is related to the family member"
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.consentButton}
        onPress={() => setHasConsent(!hasConsent)}
        disabled={busy}
        accessible={true}
        accessibilityLabel="I have permission to add this person's photo"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: hasConsent }}
      >
        <View style={[styles.checkbox, hasConsent && styles.checkedCheckbox]} />
        <Text style={styles.consentText}>
          I have permission to add this person's photo to our family memory
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitButton, busy && styles.disabledButton]}
        onPress={handleSubmit}
        disabled={busy || !selectedImage || !hasConsent}
        accessible={true}
        accessibilityLabel="Upload photo"
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !selectedImage || !hasConsent }}
      >
        <Text style={styles.submitButtonText}>
          {busy ? 'Uploading...' : 'Upload Photo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.md,
  },
  title: {
    ...TEXT_STYLES.h3,
    color: COLORS.ink,
    marginBottom: SPACING.lg,
  },
  imagePicker: {
    height: 200,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.inkLightest,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLighter,
  },
  personSelection: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  optionButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.white,
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: COLORS.primaryLightest,
    borderColor: COLORS.primary,
  },
  optionText: {
    ...TEXT_STYLES.label,
    color: COLORS.ink,
  },
  existingPersonList: {
    maxHeight: 150,
    marginBottom: SPACING.lg,
  },
  personItem: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.divider,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  selectedPerson: {
    backgroundColor: COLORS.primaryLightest,
    borderColor: COLORS.primary,
  },
  personName: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.medium,
    color: COLORS.ink,
  },
  personRelation: {
    ...TEXT_STYLES.caption,
    color: COLORS.inkLight,
    marginTop: SPACING.xs,
  },
  newPersonForm: {
    marginBottom: SPACING.lg,
  },
  label: {
    ...TEXT_STYLES.label,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...TEXT_STYLES.body,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.white,
  },
  consentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.divider,
    marginRight: SPACING.md,
  },
  checkedCheckbox: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  consentText: {
    flex: 1,
    ...TEXT_STYLES.body,
    color: COLORS.ink,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: COLORS.inkLighter,
  },
  submitButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
});
