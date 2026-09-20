import { describe, expect, it } from "vitest";
import { memoryScene } from "../lib/memory-scene";
import { addSceneAnswer, sceneFixture } from "./fixtures/memory-scene";

describe("the unfolding story", () => {
  it("builds three source-linked perspectives and keeps a photo-only relative at the center", () => {
    const data = sceneFixture();
    data.memories.unshift({
      ...data.memories[2],
      id: "new-photo",
      contributor_id: "elena",
    });
    data.provenance.push({
      ...data.provenance[0],
      id: "new-link",
      memory_id: "new-photo",
    });
    const scene = memoryScene(data)!;
    expect(scene.anchor.id).toBe("cake");
    expect(scene.perspectives.map((p) => p.name)).toEqual([
      "Maya",
      "Elena",
      "David",
    ]);
    expect(scene.photoOwner).toBe("David");
    expect(scene.recipient?.name).toBe("David");
  });
  it("does not include unlinked memories or switch a removed pinned story", () => {
    const data = sceneFixture();
    data.provenance = [];
    expect(memoryScene(data)).toBeNull();
    expect(memoryScene(sceneFixture(), "removed")).toBeNull();
  });
  it("recognizes edge provenance and preserves perspectives when an answer arrives", () => {
    const data = sceneFixture();
    const before = memoryScene(data)!;
    addSceneAnswer(data);
    const after = memoryScene(data, "cake")!;
    expect(after.perspectives).toEqual(before.perspectives);
    expect(after.origin?.node.label).toBe("Nana’s kitchen in Brighton");
    expect(after.origin?.source.memory.id).toBe("answer");
    expect(after.question).toBeNull();
  });
  it("shows a new answer without claiming an uncertain answer closes the gap", () => {
    const data = sceneFixture();
    addSceneAnswer(data, false);
    const scene = memoryScene(data)!;
    expect(scene.origin).toBeNull();
    expect(scene.latestAnswer?.name).toBe("David");
    expect(scene.latestAnswer?.memory.transcript).toContain("don’t know");
  });
  it("accepts the same origin relations and directions as the Weaver", () => {
    const data = sceneFixture();
    addSceneAnswer(data);
    data.edges[0] = {
      ...data.edges[0],
      rel: "started_by",
      from_node: "brighton",
      to_node: "cake",
    };
    expect(memoryScene(data)?.origin?.node.id).toBe("brighton");
  });
  it("requires a surviving source for the origin, even when an edge exists", () => {
    const data = sceneFixture();
    addSceneAnswer(data);
    data.memories = data.memories.filter((m) => m.id !== "answer");
    expect(memoryScene(data)?.origin).toBeNull();
    expect(memoryScene(data)?.latestAnswer).toBeNull();
  });
});
