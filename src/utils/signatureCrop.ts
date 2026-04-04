import type { Area } from "react-easy-crop";
import {
  SIGNATURE_EXPORT_HEIGHT,
  SIGNATURE_EXPORT_WIDTH,
} from "../constants/signatureDisplay";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.src = src;
  });
}

/**
 * Renders the cropped region onto a white canvas and returns a PNG blob.
 */
export async function getSignaturePngBlob(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = SIGNATURE_EXPORT_WIDTH;
  canvas.height = SIGNATURE_EXPORT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível preparar a imagem");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    SIGNATURE_EXPORT_WIDTH,
    SIGNATURE_EXPORT_HEIGHT
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Imagem vazia"));
      },
      "image/png",
      1
    );
  });
}
