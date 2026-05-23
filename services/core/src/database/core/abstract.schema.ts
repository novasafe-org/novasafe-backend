import type { Schema, SchemaDefinition, SchemaOptions } from 'mongoose';
import { createBaseSchema } from '../schemas/base.schema';

/**
 * Helper for module schemas to inherit base fields and plugins.
 */
export abstract class AbstractSchemaFactory {
  protected abstract readonly definition: SchemaDefinition;

  protected schemaOptions: SchemaOptions = {};

  build(): Schema {
    return createBaseSchema(this.definition, this.schemaOptions);
  }
}

