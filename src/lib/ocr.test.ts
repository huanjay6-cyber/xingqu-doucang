import { describe, expect, it } from "vitest";
import { parseColorSummary } from "./ocr";

describe("图纸汇总区解析", () => {
  it("解析括号格式并将零填充色号映射到内置色卡", () => {
    expect(parseColorSummary(
      "H02 (3483) H07 (1757) H09 (383) H03 (197) H11 (150) H05 (76) H04 (38)",
    )).toEqual([
      { colorId: "H2", quantity: 3483 },
      { colorId: "H7", quantity: 1757 },
      { colorId: "H9", quantity: 383 },
      { colorId: "H3", quantity: 197 },
      { colorId: "H11", quantity: 150 },
      { colorId: "H5", quantity: 76 },
      { colorId: "H4", quantity: 38 },
    ]);
  });

  it("修正常见的 O 和 0 识别混淆", () => {
    expect(parseColorSummary("HO2（3483）")).toEqual([{ colorId: "H2", quantity: 3483 }]);
  });

  it("没有汇总格式时不统计网格中的重复色号", () => {
    expect(parseColorSummary("H02 H02 H07 H02 77 78 1 2 3 4")).toEqual([]);
  });

  it("括号丢失时只接受三位及以上数量", () => {
    expect(parseColorSummary("H02 3483 H04 38")).toEqual([{ colorId: "H2", quantity: 3483 }]);
  });

  it("合并同一汇总区中括号完整和三位以上括号缺失的条目", () => {
    expect(parseColorSummary("H09 (383) H03 (197) H02 3483 H07 1757 H05 76")).toEqual([
      { colorId: "H9", quantity: 383 },
      { colorId: "H3", quantity: 197 },
      { colorId: "H2", quantity: 3483 },
      { colorId: "H7", quantity: 1757 },
    ]);
  });

  it("不把单侧括号附近的网格编号当成汇总", () => {
    expect(parseColorSummary("H02 [3 H07 17] H05 [76")).toEqual([]);
  });
});
