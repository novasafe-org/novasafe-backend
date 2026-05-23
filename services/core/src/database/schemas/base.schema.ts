import { Schema, type SchemaDefinition, type SchemaOptions } from 'mongoose';
import { auditFields } from './common/audit-info.schema';
import { metadataField } from './common/metadata.schema';
import { softDeleteFields } from './common/soft-delete.schema';
import { versioningFields } from './common/versioning.schema';
import { softDeletePlugin, timestampsPlugin } from '../plugins';

export const baseSchemaFields: SchemaDefinition = {
  ...softDeleteFields,
  ...metadataField,
  ...versioningFields,
  createdBy: auditFields.createdBy,
  updatedBy: auditFields.updatedBy,
};

export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  minimize: false,
};

/**
 * Creates a schema with shared base fields and plugins.
 */
export const createBaseSchema = (
  definition: SchemaDefinition = {},
  options: SchemaOptions = {},
): Schema => {
  const schema = new Schema(
    {
      ...baseSchemaFields,
      ...definition,
    },
    { ...baseSchemaOptions, ...options },
  );

  schema.plugin(timestampsPlugin);
  schema.plugin(softDeletePlugin);

  return schema;
};
