import { model, Schema, type InferSchemaType } from 'mongoose';

const stepSchema = new Schema(
  {
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false, minimize: false },
);

const webhookSchema = new Schema(
  {
    hookId: { type: Number, required: true },
    secret: { type: String, required: true },
    repository: { type: String, required: true },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false },
);

const zapSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: false },
    draft: { type: Boolean, required: true, default: false },
    trigger: { type: stepSchema, required: true },
    action: { type: stepSchema, required: true },
    webhook: { type: webhookSchema, default: null },
  },
  { timestamps: true, minimize: false },
);

zapSchema.index(
  { 'webhook.hookId': 1 },
  { unique: true, partialFilterExpression: { 'webhook.hookId': { $type: 'number' } } },
);

export type ZapRecord = InferSchemaType<typeof zapSchema>;

export const ZapModel = model('Zap', zapSchema);
