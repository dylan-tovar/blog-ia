export type ImageUploadErrorCode =
  | "type"
  | "empty"
  | "size"
  | "decode"
  | "too-large"
  | "auth"
  | "upload";

export class ImageUploadError extends Error {
  constructor(readonly code: ImageUploadErrorCode) {
    super(code);
    this.name = "ImageUploadError";
  }
}

const MESSAGES: Record<ImageUploadErrorCode, string> = {
  type: "Solo podés subir imágenes JPG, PNG o WebP.",
  empty: "El archivo está vacío.",
  size: "La imagen pesa más de 10 MB. Probá con una más liviana.",
  decode: "No pudimos leer la imagen. Probá con otro archivo.",
  "too-large": "La imagen sigue siendo demasiado pesada después de optimizarla (máximo 2 MB).",
  auth: "Tu sesión venció. Iniciá sesión de nuevo para subir imágenes.",
  upload: "No se pudo subir la imagen. Probá de nuevo.",
};

export function describeImageError(error: unknown): string {
  return error instanceof ImageUploadError ? MESSAGES[error.code] : MESSAGES.upload;
}
