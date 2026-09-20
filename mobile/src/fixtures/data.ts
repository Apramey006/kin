import type { Relative, GraphNodeRow, MemoryRow, WeaverQuestionRow } from '../types';

export const fixtureRelatives: Relative[] = [
  {
    id: 'rel-1',
    family_id: 'family-1',
    name: 'Maya',
    relation_to_wearer: 'granddaughter',
    color: '#FF6B6B',
  },
  {
    id: 'rel-2',
    family_id: 'family-1',
    name: 'David',
    relation_to_wearer: 'grandson',
    color: '#4ECDC4',
  },
  {
    id: 'rel-3',
    family_id: 'family-1',
    name: 'Sarah',
    relation_to_wearer: 'daughter',
    color: '#45B7D1',
  },
];

export const fixturePersonNodes: GraphNodeRow[] = [
  {
    id: 'node-1',
    family_id: 'family-1',
    type: 'person',
    label: 'Grandma',
    aliases: ['Grandmother', 'Nana'],
    relation_to_wearer: 'self',
  },
  {
    id: 'node-2',
    family_id: 'family-1',
    type: 'person',
    label: 'Nora',
    aliases: ['Aunt Nora'],
    relation_to_wearer: 'sister',
  },
  {
    id: 'node-3',
    family_id: 'family-1',
    type: 'person',
    label: 'Daniel',
    aliases: ['Uncle Daniel'],
    relation_to_wearer: 'brother',
  },
];

export const fixtureMemories: MemoryRow[] = [
  {
    id: 'mem-1',
    family_id: 'family-1',
    contributor_id: 'rel-1',
    kind: 'photo',
    media_path: '/media/family-1/photo1.jpg',
    transcript: null,
    caption: 'A family photo showing Grandma and Nora together',
    summary: 'Maya shared a photo of Grandma and Nora: A family photo showing Grandma and Nora together',
    source_question_id: null,
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'mem-2',
    family_id: 'family-1',
    contributor_id: 'rel-1',
    kind: 'story',
    media_path: '/media/family-1/story1.m4a',
    transcript: 'Grandma and Nora used to bake lemon cake every Sunday. Nora always wore that ridiculous yellow apron.',
    caption: null,
    summary: 'Maya recorded a story about Grandma and Nora baking lemon cake every Sunday, with Nora wearing her yellow apron',
    source_question_id: null,
    created_at: '2024-01-15T11:00:00Z',
  },
  {
    id: 'mem-3',
    family_id: 'family-1',
    contributor_id: 'rel-2',
    kind: 'photo',
    media_path: '/media/family-1/photo2.jpg',
    transcript: null,
    caption: 'Nana\'s old recipe book',
    summary: 'David shared a photo of Nana\'s old recipe book',
    source_question_id: null,
    created_at: '2024-01-16T09:00:00Z',
  },
];

export const fixtureWeaverQuestions: WeaverQuestionRow[] = [
  {
    id: 'weaver-1',
    family_id: 'family-1',
    target_relative_id: 'rel-2',
    gap_node_id: 'node-2',
    gap_type: 'origin',
    question_text: 'You uploaded Nana\'s recipe book, and Maya remembers Grandma baking lemon cake with Nora. No one has recorded where the recipe came from. Do you remember?',
    evidence: [
      {
        memory_id: 'mem-2',
        contributor_id: 'rel-1',
        summary: 'Maya recorded a story about Grandma and Nora baking lemon cake every Sunday',
      },
      {
        memory_id: 'mem-3',
        contributor_id: 'rel-2',
        summary: 'David shared a photo of Nana\'s old recipe book',
      },
    ],
    status: 'open',
    answer_memory_id: null,
    created_at: '2024-01-16T12:00:00Z',
  },
];

export const fixtureWearer = {
  family_id: 'family-1',
  name: 'Grandma',
};

export const FAMILY_ID = 'family-1';

export function useFixtures(enabled: boolean = true) {
  return {
    relatives: enabled ? fixtureRelatives : [],
    personNodes: enabled ? fixturePersonNodes : [],
    memories: enabled ? fixtureMemories : [],
    weaverQuestions: enabled ? fixtureWeaverQuestions : [],
    wearer: enabled ? fixtureWearer : null,
  };
}
