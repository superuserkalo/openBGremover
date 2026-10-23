import { describe, expect, it } from "vitest";
import {
  REDUCED_MOTION_ELAPSED,
  SCENE_SECONDS,
  SCENES,
  portraitAt,
  scenePhase,
} from "./media-stage";

describe("media stage scenes", () => {
  it("visits every scene once per loop, in order", () => {
    const ids = SCENES.map((_, index) =>
      scenePhase(index * SCENE_SECONDS + 1).scene.id,
    );

    expect(ids).toEqual(SCENES.map((scene) => scene.id));
    expect(scenePhase(SCENES.length * SCENE_SECONDS + 1).index).toBe(0);
  });

  it("covers every media type", () => {
    const media = new Set(SCENES.map((scene) => scene.media));

    expect([...media].sort()).toEqual(
      ["AUDIO", "DOCUMENT", "IMAGE", "PDF", "VIDEO"],
    );
  });

  it("never shows the same media type twice in a row", () => {
    SCENES.forEach((scene, index) => {
      const next = SCENES[(index + 1) % SCENES.length];

      expect(next?.media).not.toBe(scene.media);
    });
  });

  it("finishes the scan before the scene fades out", () => {
    const start = scenePhase(0.5);
    const end = scenePhase(SCENE_SECONDS - 0.7);

    expect(start.sweep).toBe(0);
    expect(end.sweep).toBe(1);
    expect(end.vanish).toBe(0);
  });

  it("shows a finished background removal under reduced motion", () => {
    const phase = scenePhase(REDUCED_MOTION_ELAPSED);

    expect(phase.scene.id).toBe("remove");
    expect(phase.sweep).toBe(1);
    expect(phase.vanish).toBe(0);
  });
});

describe("portrait", () => {
  it("keeps the astronaut and drops the backdrop", () => {
    // Face, centre of the photo near the top third.
    expect(portraitAt(0.45, 0.25).subject).toBe(true);
    // Top-left corner: the flag behind her.
    expect(portraitAt(0.03, 0.03).subject).toBe(false);
  });

  it("returns darkness in range", () => {
    for (const [u, v] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ] as const) {
      const { dark } = portraitAt(u, v);

      expect(dark).toBeGreaterThanOrEqual(0);
      expect(dark).toBeLessThanOrEqual(1);
    }
  });
});
