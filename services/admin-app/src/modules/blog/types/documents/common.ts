/** 24-character hex MongoDB ObjectId serialized as string. */
export type ObjectIdString = string & { readonly __brand: "ObjectId" };

export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export function isObjectId(value: string): value is ObjectIdString {
  return OBJECT_ID_REGEX.test(value);
}

export function asObjectId(value: string): ObjectIdString {
  return value as ObjectIdString;
}

export type Timestamps = {
  created_at: Date;
  updated_at?: Date;
};

export type PaginationOptions = {
  page: number;
  perPage: number;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export type SortDirection = "asc" | "desc";

export type PostStatus = "draft" | "published" | "scheduled" | "archived";

export type PostAuthor = {
  id: string;
  name: string;
  email?: string;
};
