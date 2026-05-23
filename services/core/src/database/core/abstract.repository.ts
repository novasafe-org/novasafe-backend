import type { ClientSession, Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import { Types } from 'mongoose';
import type {
  MongooseFilter,
  PaginatedResult,
  PaginationParams,
  RepositoryOptions,
} from './database.types';
import { buildPaginatedResult, normalizePagination } from '../utils/pagination.util';

/**
 * Generic repository contract for module-specific repositories.
 */
export interface IRepository<TEntity, TDoc extends Document = Document> {
  create(data: Partial<TEntity>, options?: RepositoryOptions): Promise<TEntity>;
  findById(id: string, options?: RepositoryOptions): Promise<TEntity | null>;
  findOne(filter: MongooseFilter<TDoc>, options?: RepositoryOptions): Promise<TEntity | null>;
  findMany(filter: MongooseFilter<TDoc>, options?: RepositoryOptions): Promise<TEntity[]>;
  update(id: string, data: Partial<TEntity>, options?: RepositoryOptions): Promise<TEntity | null>;
  delete(id: string, options?: RepositoryOptions): Promise<boolean>;
  paginate(
    filter: MongooseFilter<TDoc>,
    params?: PaginationParams,
    options?: RepositoryOptions,
  ): Promise<PaginatedResult<TEntity>>;
}

/**
 * Abstract Mongoose repository with reusable CRUD and pagination.
 */
export abstract class AbstractRepository<TEntity, TDoc extends Document>
implements IRepository<TEntity, TDoc> {
  constructor(protected readonly model: Model<TDoc>) {}

  protected abstract toEntity(document: TDoc): TEntity;

  protected getSession(options?: RepositoryOptions): ClientSession | undefined {
    return options?.session;
  }

  protected notDeletedFilter(): MongooseFilter<TDoc> {
    return { deletedAt: null } as MongooseFilter<TDoc>;
  }

  async create(data: Partial<TEntity>, options?: RepositoryOptions): Promise<TEntity> {
    const session = this.getSession(options);
    const docs = await this.model.create([data as unknown as TDoc], { session });
    return this.toEntity(docs[0]);
  }

  async findById(id: string, options?: RepositoryOptions): Promise<TEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOne({ _id: id, ...this.notDeletedFilter() } as FilterQuery<TDoc>)
      .session(this.getSession(options) ?? null)
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findOne(filter: MongooseFilter<TDoc>, options?: RepositoryOptions): Promise<TEntity | null> {
    const doc = await this.model
      .findOne({ ...filter, ...this.notDeletedFilter() })
      .session(this.getSession(options) ?? null)
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findMany(filter: MongooseFilter<TDoc>, options?: RepositoryOptions): Promise<TEntity[]> {
    const docs = await this.model
      .find({ ...filter, ...this.notDeletedFilter() })
      .session(this.getSession(options) ?? null)
      .exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(
    id: string,
    data: Partial<TEntity>,
    options?: RepositoryOptions,
  ): Promise<TEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, ...this.notDeletedFilter() } as FilterQuery<TDoc>,
        { $set: data } as UpdateQuery<TDoc>,
        { new: true, session: this.getSession(options) },
      )
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string, options?: RepositoryOptions): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model
      .updateOne(
        { _id: id } as FilterQuery<TDoc>,
        { $set: { deletedAt: new Date() } } as UpdateQuery<TDoc>,
        { session: this.getSession(options) },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  async paginate(
    filter: MongooseFilter<TDoc>,
    params?: PaginationParams,
    options?: RepositoryOptions,
  ): Promise<PaginatedResult<TEntity>> {
    const { page, limit, skip, sort } = normalizePagination(params);
    const query = { ...filter, ...this.notDeletedFilter() };
    const session = this.getSession(options);

    const [docs, total] = await Promise.all([
      this.model.find(query).sort(sort).skip(skip).limit(limit).session(session ?? null).exec(),
      this.model.countDocuments(query).session(session ?? null).exec(),
    ]);

    return buildPaginatedResult(
      docs.map((doc) => this.toEntity(doc)),
      total,
      page,
      limit,
    );
  }
}
