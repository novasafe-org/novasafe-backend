import type { Db } from "mongodb";
import type { IMongoClient } from "@/repositories/client/types";
import { createNativeMongoClient } from "@/repositories/client/native-mongo.client";
import { CategoriesRepository } from "./categories.repository";
import { MediaRepository } from "./media.repository";
import { PostsRepository } from "./posts.repository";
import { TagsRepository } from "./tags.repository";
import type { MongoRepositories } from "./types";

export function createMongoRepositories(client: IMongoClient): MongoRepositories {
  return {
    posts: new PostsRepository(client),
    categories: new CategoriesRepository(client),
    tags: new TagsRepository(client),
    media: new MediaRepository(client),
  };
}

export function createMongoRepositoriesFromDatabase(db: Db): MongoRepositories {
  return createMongoRepositories(createNativeMongoClient(db));
}

export * from "./types";
export { PostsRepository } from "./posts.repository";
export { CategoriesRepository } from "./categories.repository";
export { TagsRepository } from "./tags.repository";
export { MediaRepository } from "./media.repository";
