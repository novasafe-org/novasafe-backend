import type { Document, Model } from 'mongoose';
import type { BaseEntity } from '../core/base.entity';
import { BaseRepository } from '../core/base.repository';

type RepositoryConstructor<TEntity extends BaseEntity, TDoc extends Document> = new (
  model: Model<TDoc>,
) => BaseRepository<TEntity, TDoc>;

/**
 * Registry for module repositories (placeholder until business modules register models).
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory | null = null;

  private readonly registry = new Map<string, unknown>();

  private constructor() {}

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  register<TEntity extends BaseEntity, TDoc extends Document>(
    name: string,
    model: Model<TDoc>,
    RepositoryClass: RepositoryConstructor<TEntity, TDoc> = BaseRepository as RepositoryConstructor<
      TEntity,
      TDoc
    >,
  ): BaseRepository<TEntity, TDoc> {
    const repository = new RepositoryClass(model);
    this.registry.set(name, repository);
    return repository;
  }

  get<T extends BaseRepository<BaseEntity, Document>>(name: string): T | undefined {
    return this.registry.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  clear(): void {
    this.registry.clear();
  }
}
