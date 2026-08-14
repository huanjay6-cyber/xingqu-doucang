export type CropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function compressImage(file: File): Promise<string> {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export async function compressImageBlob(file: File): Promise<Blob> {
  const dataUrl = await compressImage(file);
  return dataUrlToBlob(dataUrl);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/^data:(.*?);base64$/)?.[1] ?? "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export async function cropImageFile(file: File, region: CropRegion): Promise<File> {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const sourceLeft = Math.round(image.naturalWidth * region.x);
  const sourceTop = Math.round(image.naturalHeight * region.y);
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * region.width));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * region.height));
  const targetWidth = Math.min(3200, Math.max(1600, sourceWidth * 2));
  const scale = targetWidth / sourceWidth;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理框选区域");
  context.drawImage(
    image,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("无法生成识别区域图片")), "image/png");
  });
  return new File([blob], "pattern-summary-crop.png", { type: "image/png" });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}
