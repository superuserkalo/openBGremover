import { describe, expect, it } from "vitest";
import { CELL_SIZE, GLYPHS, sampleCell } from "./signal-field";
import type { FieldState } from "./signal-field";

const base: FieldState = {
  width: 1200,
  height: 660,
  time: 4.5,
  pointerX: 0,
  pointerY: 0,
  presence: 0,
};

function cellAt(state: FieldState, x: number, y: number) {
  return sampleCell(state, Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE));
}

describe("signal field", () => {
  it("keeps the top of the hero clear for the headline", () => {
    for (let x = 0; x < base.width; x += CELL_SIZE)
      expect(cellAt(base, x, 40).kind).toBe("none");
  });

  it("draws the scan line as an orange bar inside the ribbon", () => {
    // time 4.5 puts the sweep at half the width.
    const row = Math.floor((base.height * 0.8) / CELL_SIZE);

    const bars = Array.from({ length: 100 }, (_, column) =>
      sampleCell(base, column, row),
    ).flatMap((paint, column) =>
      paint.kind === "glyph" && paint.glyph === 4329604 ? [column] : [],
    );

    expect(bars).toHaveLength(1);
    expect(Math.abs((bars[0] ?? 0) - 50)).toBeLessThanOrEqual(1);
  });

  it("cuts the reticle interior to a checkerboard", () => {
    const state = { ...base, pointerX: 300, pointerY: 200, presence: 1 };

    expect(cellAt(state, 300, 200)).toMatchObject({ kind: "glyph", ink: "orange" });
    expect(cellAt(state, 300 + 30, 200).kind).toBe("checker");
  });

  it("only uses glyphs from the bitmap table", () => {
    const allowed = new Set<number>([...GLYPHS, 4329604, 145536]);

    for (let row = 0; row < 55; row++)
      for (let column = 0; column < 100; column++) {
        const paint = sampleCell(base, column, row);

        if (paint.kind === "glyph") expect(allowed.has(paint.glyph)).toBe(true);
      }
  });
});
