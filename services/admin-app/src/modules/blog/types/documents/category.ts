import type { ObjectIdString } from "./common";

export type CategoryDocument = {
  _id: ObjectIdString;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
};

export type CreateCategoryInput = Omit<CategoryDocument, "_id" | "created_at"> & {
  _id?: ObjectIdString;
};

export type UpdateCategoryInput = Partial<Pick<CategoryDocument, "name" | "slug" | "description">>;
