import type { ObjectIdString } from "./common";

export type MediaDocument = {
  _id: ObjectIdString;
  filename: string;
  original_name: string;
  r2_key: string;
  url: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  uploaded_by: string;
  uploaded_at: Date;
};

export type CreateMediaInput = Omit<MediaDocument, "_id" | "uploaded_at"> & {
  _id?: ObjectIdString;
  uploaded_at?: Date;
};

export type UpdateMediaInput = Partial<
  Pick<
    MediaDocument,
    "filename" | "original_name" | "url" | "mime_type" | "size" | "alt_text" | "width" | "height"
  >
>;

export type ListMediaFilter = {
  mime_type?: string;
};

export type ImageTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "avif" | "jpeg" | "png" | "auto";
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
};
