import type { Document } from 'mongoose';
import { BaseEntity } from './base.entity';
import { AbstractRepository } from './abstract.repository';

/**
 * Default entity mapping for repositories that use {@link BaseEntity}.
 */
export class BaseRepository<
  TEntity extends BaseEntity,
  TDoc extends Document,
> extends AbstractRepository<TEntity, TDoc> {
  protected toEntity(document: TDoc): TEntity {
    const plain = document.toObject({ virtuals: true });
    return plain as TEntity;
  }
}
