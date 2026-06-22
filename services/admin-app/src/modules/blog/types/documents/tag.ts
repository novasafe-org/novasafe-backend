import type { ObjectIdString } from "./common";

export type TagDocument = {
  _id: ObjectIdString;
  name: string;
  slug: string;
  created_at: Date;
};

export type CreateTagInput = Omit<TagDocument, "_id" | "created_at"> & {
  _id?: ObjectIdString;
};

export type UpdateTagInput = Partial<Pick<TagDocument, "name" | "slug">>;
