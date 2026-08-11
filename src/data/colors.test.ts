import { describe, expect, it } from "vitest";
import { beadColors } from "./colors";
import { COLOR_LETTERS } from "../types";

describe("内置拼豆色卡", () => {
  it("包含 221 个唯一色号", () => {
    expect(beadColors).toHaveLength(221);
    expect(new Set(beadColors.map((color) => color.code)).size).toBe(221);
  });

  it("覆盖约定的九个字母索引", () => {
    expect([...new Set(beadColors.map((color) => color.letter))]).toEqual(COLOR_LETTERS);
  });

  it("每个色号都有有效的 HEX 色值", () => {
    beadColors.forEach((color) => expect(color.hex).toMatch(/^#[0-9A-F]{6}$/));
  });
});
