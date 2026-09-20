import type { Relative, GraphNodeRow, MemoryRow, WeaverQuestionRow } from '../types';

// Fixture data mirrors the seeded web demo family so the mobile app can be
// demoed without a backend. When EXPO_PUBLIC_API_URL is configured, screens
// can be switched to apiClient.

export const FAMILY_ID = 'family-1';

export const fixtureWearer = {
  family_id: FAMILY_ID,
  name: 'Grandma',
};

export const fixtureRelatives: Relative[] = [
  {
    id: 'rel-1',
    family_id: FAMILY_ID,
    name: 'Maya',
    relation_to_wearer: 'granddaughter',
    color: '#C2543A',
  },
  {
    id: 'rel-2',
    family_id: FAMILY_ID,
    name: 'David',
    relation_to_wearer: 'grandson',
    color: '#4E7E9B',
  },
  {
    id: 'rel-3',
    family_id: FAMILY_ID,
    name: 'Sarah',
    relation_to_wearer: 'daughter',
    color: '#7A6AAE',
  },
];

// People Kin can recognize: enrolled family faces.
export const fixturePersonNodes: GraphNodeRow[] = [
  {
    id: 'node-1',
    family_id: FAMILY_ID,
    type: 'person',
    label: 'Grandma',
    aliases: ['Grandmother', 'Nana'],
    relation_to_wearer: 'self',
  },
  {
    id: 'node-2',
    family_id: FAMILY_ID,
    type: 'person',
    label: 'Nora',
    aliases: ['Aunt Nora'],
    relation_to_wearer: 'sister',
  },
  {
    id: 'node-3',
    family_id: FAMILY_ID,
    type: 'person',
    label: 'Daniel',
    aliases: ['Uncle Daniel'],
    relation_to_wearer: 'brother',
  },
];

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60000).toISOString();

export const fixtureMemories: MemoryRow[] = [
  {
    id: 'mem-1',
    family_id: FAMILY_ID,
    contributor_id: 'rel-1',
    kind: 'photo',
    media_path: '/media/family-1/kitchen.jpg',
    mediaUrl: require('../../assets/fixtures/photo-kitchen.png'),
    transcript: null,
    caption: 'Sunday baking in the old kitchen',
    summary: 'Sunday baking in the old kitchen',
    source_question_id: null,
    created_at: ago(60 * 26),
  },
  {
    id: 'mem-2',
    family_id: FAMILY_ID,
    contributor_id: 'rel-1',
    kind: 'story',
    media_path: '/media/family-1/story1.m4a',
    mediaUrl: null,
    transcript:
      'Grandma and Nora used to bake lemon cake every Sunday. Nora always wore that ridiculous yellow apron.',
    caption: null,
    summary: 'Lemon cake on Sundays, and Nora’s yellow apron',
    source_question_id: null,
    created_at: ago(60 * 25),
  },
  {
    id: 'mem-3',
    family_id: FAMILY_ID,
    contributor_id: 'rel-2',
    kind: 'photo',
    media_path: '/media/family-1/recipe.jpg',
    mediaUrl: require('../../assets/fixtures/photo-recipe.png'),
    transcript: null,
    caption: 'Nana’s old recipe book',
    summary: 'Nana’s old recipe book',
    source_question_id: null,
    created_at: ago(60 * 20),
  },
  {
    id: 'mem-4',
    family_id: FAMILY_ID,
    contributor_id: 'rel-3',
    kind: 'story',
    media_path: '/media/family-1/story2.m4a',
    mediaUrl: null,
    transcript:
      'Mom grew the sweetest tomatoes in her garden. She would bring a basket to every family dinner in August.',
    caption: null,
    summary: 'Tomatoes from Mom’s garden every August',
    source_question_id: null,
    created_at: ago(60 * 6),
  },
  {
    id: 'mem-5',
    family_id: FAMILY_ID,
    contributor_id: 'rel-2',
    kind: 'answer',
    media_path: null,
    mediaUrl: null,
    transcript:
      'The recipe came from Nora’s mother-in-law, who brought it from Lisbon. That’s why the cake has a little almond in it.',
    caption: null,
    summary: 'Where the lemon cake recipe came from',
    source_question_id: 'weaver-0',
    created_at: ago(60 * 3),
  },
];

export const fixtureWeaverQuestions: WeaverQuestionRow[] = [
  {
    id: 'weaver-1',
    family_id: FAMILY_ID,
    target_relative_id: 'rel-1',
    gap_node_id: 'node-2',
    gap_type: 'origin',
    question_text:
      'You recorded that Grandma and Nora baked lemon cake every Sunday, and David shared Nana’s recipe book. Do you remember where the recipe originally came from?',
    evidence: [
      {
        memory_id: 'mem-2',
        contributor_id: 'rel-1',
        summary: 'Lemon cake on Sundays, and Nora’s yellow apron',
      },
      {
        memory_id: 'mem-3',
        contributor_id: 'rel-2',
        summary: 'Nana’s old recipe book',
      },
    ],
    status: 'open',
    answer_memory_id: null,
    created_at: ago(60 * 2),
  },
  {
    id: 'weaver-2',
    family_id: FAMILY_ID,
    target_relative_id: 'rel-1',
    gap_node_id: 'node-3',
    gap_type: 'connection',
    question_text:
      'Sarah mentioned tomatoes from the garden every August. Do you remember when Uncle Daniel helped Grandma plant that garden?',
    evidence: [
      {
        memory_id: 'mem-4',
        contributor_id: 'rel-3',
        summary: 'Tomatoes from Mom’s garden every August',
      },
    ],
    status: 'open',
    answer_memory_id: null,
    created_at: ago(40),
  },
];

// Cues the companion rotates through when a familiar face is seen.
// Each mirrors what the web recall cue would sound like.
export const fixtureCues: { person: string; text: string }[] = [
  {
    person: 'Maya',
    text: 'That’s Maya, your granddaughter. She told the story about lemon cake on Sundays.',
  },
  {
    person: 'David',
    text: 'That’s David, your grandson. He shared the photo of your old recipe book.',
  },
  {
    person: 'Sarah',
    text: 'That’s Sarah, your daughter. She remembers the tomatoes from your garden every August.',
  },
];

export function useFixtures(enabled: boolean = true) {
  return {
    relatives: enabled ? fixtureRelatives : [],
    personNodes: enabled ? fixturePersonNodes : [],
    memories: enabled ? fixtureMemories : [],
    weaverQuestions: enabled ? fixtureWeaverQuestions : [],
    wearer: enabled ? fixtureWearer : null,
  };
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function relativeTime(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  return minutes < 1
    ? 'Just now'
    : minutes < 60
      ? `${minutes} min ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hr ago`
        : new Date(value).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });
}
