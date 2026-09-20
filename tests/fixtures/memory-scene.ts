import { DEMO_CONTRIBUTOR_IDS, DEMO_FAMILY_ID } from "../../lib/demo";
import type { SceneData } from "../../lib/memory-scene";

export function sceneFixture(): SceneData {
  const familyId = DEMO_FAMILY_ID;
  const relatives = [
    {
      id: DEMO_CONTRIBUTOR_IDS.maya,
      name: "Maya",
      relation_to_wearer: "granddaughter",
      color: "#dac2a4",
      family_id: familyId,
    },
    {
      id: DEMO_CONTRIBUTOR_IDS.elena,
      name: "Elena",
      relation_to_wearer: "daughter",
      color: "#c8d0b9",
      family_id: familyId,
    },
    {
      id: DEMO_CONTRIBUTOR_IDS.david,
      name: "David",
      relation_to_wearer: "son",
      color: "#c6ae79",
      family_id: familyId,
    },
  ];
  const image =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="560"><rect width="760" height="560" fill="#d4c4a4"/><rect x="160" y="85" width="420" height="380" rx="12" fill="#f1e7cf"/><path d="M370 90V465" stroke="#b4a584"/><text x="190" y="180" font-size="26" fill="#736446">Lemon cake</text><path d="M195 215H335M195 250H335M195 285H320M410 190H535M410 225H530" stroke="#b6a789" stroke-width="7"/><circle cx="480" cy="350" r="52" fill="#dbc44e"/></svg>',
    );
  const memories: SceneData["memories"] = relatives.map((r, i) => ({
    id: `memory-${r.name.toLowerCase()}`,
    family_id: familyId,
    contributor_id: r.id,
    kind: i === 2 ? "photo" : "story",
    media_path: null,
    mediaUrl: i === 2 ? image : null,
    transcript:
      i === 0
        ? "Rosa and Nora baked lemon cake every Sunday. Nora always wore her yellow apron. The kitchen smelled of lemons before we even opened the door."
        : i === 1
          ? "Nora is Rosa’s sister. She taught Rosa to cook when they were girls. They still argued lovingly about how much lemon belonged in the cake."
          : null,
    caption:
      i === 2
        ? "Demo illustration. Rosa keeps Nana’s recipe book on the kitchen shelf. There are handwritten notes beside the lemon cake recipe."
        : null,
    summary: "Fictional demo memory",
    source_question_id: null,
    created_at: `2026-09-${10 + i}T12:00:00Z`,
  }));
  return {
    relativeId: DEMO_CONTRIBUTOR_IDS.maya,
    role: "contributor",
    relatives,
    memories,
    nodes: [
      {
        id: "cake",
        family_id: familyId,
        type: "tradition",
        label: "Sunday lemon cake",
        aliases: [],
        relation_to_wearer: null,
      },
    ],
    edges: [],
    provenance: memories.map((m) => ({
      id: `p-${m.id}`,
      memory_id: m.id,
      node_id: "cake",
      edge_id: null,
      contributor_id: m.contributor_id,
    })),
    questions: [
      {
        id: "question",
        family_id: familyId,
        target_relative_id: DEMO_CONTRIBUTOR_IDS.david,
        gap_node_id: "cake",
        gap_type: "missing_origin",
        question_text: "David, do you remember where their recipe came from?",
        evidence: [],
        status: "open",
        answer_memory_id: null,
        created_at: "2026-09-15T12:00:00Z",
      },
    ],
  };
}

export function addSceneAnswer(data: SceneData, connected = true) {
  const familyId = data.relatives[0]?.family_id ?? DEMO_FAMILY_ID;
  data.questions[0].status = "answered";
  data.questions[0].answer_memory_id = "answer";
  data.memories.unshift({
    id: "answer",
    family_id: familyId,
    contributor_id: DEMO_CONTRIBUTOR_IDS.david,
    kind: "answer",
    media_path: null,
    mediaUrl: null,
    transcript: connected
      ? "Nana brought the recipe from her home in Brighton."
      : "I remember the cake, but I don’t know where the recipe came from.",
    summary: "David’s answer",
    caption: null,
    source_question_id: "question",
    created_at: "2026-09-20T12:00:00Z",
  });
  if (connected) {
    data.nodes.push({
      id: "brighton",
      family_id: familyId,
      type: "place",
      label: "Nana’s kitchen in Brighton",
      aliases: [],
      relation_to_wearer: null,
    });
    data.edges.push({
      id: "origin",
      family_id: familyId,
      from_node: "cake",
      to_node: "brighton",
      rel: "origin",
    });
    data.provenance.push({
      id: "answer-source",
      memory_id: "answer",
      node_id: null,
      edge_id: "origin",
      contributor_id: DEMO_CONTRIBUTOR_IDS.david,
    });
  }
}
