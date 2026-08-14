import { beadColors } from "../data/colors";

export type RecognizedUsage = {
  colorId: string;
  quantity: number;
};

const knownColorIds = new Set(beadColors.map((color) => color.id));

function normalizeColorCode(letter: string, rawDigits: string) {
  const digits = rawDigits.toUpperCase().replaceAll("O", "0");
  const number = Number(digits);
  if (!Number.isInteger(number)) return null;
  const colorId = `${letter.toUpperCase()}${number}`;
  return knownColorIds.has(colorId) ? colorId : null;
}

export function parseColorSummary(text: string): RecognizedUsage[] {
  const results = new Map<string, { quantity: number; index: number }>();
  const normalized = text.toUpperCase().replaceAll("，", ",");
  const strictPattern = /\b([A-HM])\s*([0-9O]{1,3})\s*[（([{]\s*([0-9]{1,6})\s*[）)\]}]/g;

  const addMatches = (pattern: RegExp) => {
    for (const match of normalized.matchAll(pattern)) {
      const colorId = normalizeColorCode(match[1], match[2]);
      const quantity = Number(match[3]);
      if (colorId && quantity > 0 && !results.has(colorId)) {
        results.set(colorId, { quantity, index: match.index });
      }
    }
  };

  addMatches(strictPattern);

  // OCR occasionally drops brackets. Requiring at least three quantity digits
  // prevents row and column labels from being mistaken for summary entries.
  addMatches(/\b([A-HM])\s*([0-9O]{1,3})\s+([0-9]{3,6})\b/g);

  return [...results.entries()]
    .sort(([, left], [, right]) => left.index - right.index)
    .map(([colorId, { quantity }]) => ({ colorId, quantity }));
}

export async function recognizeColorSummary(
  file: File,
  onProgress: (progress: number) => void,
  options: { scope?: "auto" | "selected" } = {},
): Promise<RecognizedUsage[]> {
  onProgress(2);
  const image = await loadFileImage(file);
  const coarseCrop = options.scope === "selected"
    ? await createSelectedCrop(image)
    : await createCoarseCrop(image);
  onProgress(8);

  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const workerPath = new URL("ocr/worker.min.js", document.baseURI).href;
  const corePath = new URL("ocr/core", document.baseURI).href;
  const langPath = new URL("ocr/lang", document.baseURI).href;
  let completedPasses = 0;
  const recognitionPasses = 6;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath,
    corePath,
    langPath,
    logger: (message) => {
      const weighted = message.status === "recognizing text"
        ? 30 + Math.round(((completedPasses + message.progress) / recognitionPasses) * 68)
        : 8 + Math.round(message.progress * 25);
      onProgress(Math.min(98, weighted));
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      tessedit_char_whitelist: "ABCDEFGHM0123456789()[]{}（） ",
      preserve_interword_spaces: "1",
      user_defined_dpi: "220",
    });
    const coarseResult = await worker.recognize(
      coarseCrop.blob,
      {},
      { text: true, blocks: true },
    );
    completedPasses += 1;
    if (options.scope === "selected") {
      onProgress(100);
      return parseColorSummary(coarseResult.data.text);
    }
    const candidateLines = coarseResult.data.blocks
      ?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
      .filter((line) => parseColorSummary(line.text).length) ?? [];
    const lowestCandidate = Math.max(...candidateLines.map((line) => line.bbox.y1));
    const summaryLines = candidateLines.filter((line) => line.bbox.y1 >= lowestCandidate - 48);
    const coarseUsages = parseColorSummary(summaryLines.map((line) => line.text).join(" "));

    if (!summaryLines.length) {
      onProgress(100);
      return coarseUsages;
    }

    const top = Math.min(...summaryLines.map((line) => line.bbox.y0));
    const bottom = Math.max(...summaryLines.map((line) => line.bbox.y1));
    const padding = Math.max(24, (bottom - top) * 2);
    const sourceTop = coarseCrop.sourceTop + Math.max(0, top - padding) / coarseCrop.scale;
    const sourceBottom = coarseCrop.sourceTop
      + Math.min(coarseCrop.canvasHeight, bottom + padding) / coarseCrop.scale;
    const detailCrops = await createDetailCrops(image, sourceTop, sourceBottom);

    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const detailed = new Map<string, RecognizedUsage>();
    for (const detailCrop of detailCrops) {
      const result = await worker.recognize(detailCrop);
      parseColorSummary(result.data.text).forEach((usage) => detailed.set(usage.colorId, usage));
      completedPasses += 1;
    }
    coarseUsages.forEach((usage) => {
      if (!detailed.has(usage.colorId)) detailed.set(usage.colorId, usage);
    });
    onProgress(100);
    return [...detailed.values()];
  } finally {
    await worker.terminate();
  }
}

function loadFileImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片无法读取"));
    };
    image.src = url;
  });
}

type PreparedCrop = {
  blob: Blob;
  sourceTop: number;
  scale: number;
  canvasHeight: number;
};

async function createCoarseCrop(image: HTMLImageElement): Promise<PreparedCrop> {
  const sourceTop = Math.floor(image.naturalHeight * 0.82);
  const sourceHeight = image.naturalHeight - sourceTop;
  const targetWidth = Math.min(3200, Math.max(1800, image.naturalWidth));
  const scale = targetWidth / image.naturalWidth;
  const blob = await createCropBlob(
    image,
    0,
    sourceTop,
    image.naturalWidth,
    sourceHeight,
    targetWidth,
  );
  return {
    blob,
    sourceTop,
    scale,
    canvasHeight: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

async function createSelectedCrop(image: HTMLImageElement): Promise<PreparedCrop> {
  const targetWidth = Math.min(3200, Math.max(1800, image.naturalWidth));
  const scale = targetWidth / image.naturalWidth;
  const blob = await createCropBlob(
    image,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
    targetWidth,
  );
  return {
    blob,
    sourceTop: 0,
    scale,
    canvasHeight: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

function createDetailCrops(image: HTMLImageElement, sourceTop: number, sourceBottom: number) {
  const slices = [
    { left: 0, width: 0.25 },
    { left: 0.2, width: 0.25 },
    { left: 0.4, width: 0.25 },
    { left: 0.6, width: 0.25 },
    { left: 0.75, width: 0.25 },
  ];
  return Promise.all(slices.map(({ left, width }) => {
    const sourceWidth = image.naturalWidth;
    const cropLeft = Math.floor(sourceWidth * left);
    const cropWidth = Math.ceil(sourceWidth * width);
    const cropTop = Math.max(0, Math.floor(sourceTop));
    const cropBottom = Math.min(image.naturalHeight, Math.ceil(sourceBottom));
    const cropHeight = Math.max(1, cropBottom - cropTop);
    const targetWidth = Math.min(3000, Math.max(2400, cropWidth * 1.45));
    return createCropBlob(image, cropLeft, cropTop, cropWidth, cropHeight, targetWidth, false, true);
  }));
}

function createCropBlob(
  image: HTMLImageElement,
  cropLeft: number,
  cropTop: number,
  cropWidth: number,
  cropHeight: number,
  targetWidth: number,
  preprocess = true,
  normalizePanels = false,
) {
  return new Promise<Blob>((resolve, reject) => {
    const scale = targetWidth / cropWidth;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("无法处理图片"));
      return;
    }
    context.filter = preprocess ? "grayscale(1) contrast(1.35)" : "none";
    context.drawImage(
      image,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    if (normalizePanels) normalizeDarkPanels(context, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("无法生成识别图片")),
      "image/png",
    );
  });
}

function normalizeDarkPanels(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  const rowCounts = Array.from({ length: height }, () => 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
      if (luminance < 80) rowCounts[y] += 1;
    }
  }
  const darkRows = rowCounts.flatMap((count, y) => count > width * 0.025 ? [y] : []);
  if (!darkRows.length) return;

  const top = darkRows[0];
  const bottom = darkRows[darkRows.length - 1];
  const panelHeight = bottom - top + 1;
  const darkColumns = Array.from({ length: width }, () => 0);
  for (let x = 0; x < width; x += 1) {
    for (let y = top; y <= bottom; y += 1) {
      const index = (y * width + x) * 4;
      const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
      if (luminance < 80) darkColumns[x] += 1;
    }
  }

  let runStart = -1;
  for (let x = 0; x <= width; x += 1) {
    const isPanel = x < width && darkColumns[x] > panelHeight * 0.55;
    if (isPanel && runStart < 0) runStart = x;
    if ((!isPanel || x === width) && runStart >= 0) {
      if (x - runStart > width * 0.025) {
        for (let panelY = top; panelY <= bottom; panelY += 1) {
          for (let panelX = runStart; panelX < x; panelX += 1) {
            const index = (panelY * width + panelX) * 4;
            data[index] = 255 - data[index];
            data[index + 1] = 255 - data[index + 1];
            data[index + 2] = 255 - data[index + 2];
          }
        }
      }
      runStart = -1;
    }
  }
  context.putImageData(image, 0, 0);
}
