import { model, Schema } from 'mongoose';

const attemptSchema = new Schema(
  {
    number: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    outcome: { type: String, enum: ['succeeded', 'failed'], required: true },
    error: { type: String, default: null },
    retryable: { type: Boolean, required: true },
  },
  { _id: false },
);

const deliverySchema = new Schema(
  {
    zapId: { type: Schema.Types.ObjectId, ref: 'Zap', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    githubDeliveryId: { type: String, required: true },
    source: { type: String, enum: ['webhook', 'test', 'replay'], required: true },
    event: { type: String, required: true },
    eventAction: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed', 'skipped'],
      required: true,
      default: 'queued',
    },
    statusReason: { type: String, default: null },
    fields: { type: Schema.Types.Mixed, default: null },
    resolvedConfig: { type: Schema.Types.Mixed, default: null },
    missingFields: { type: [String], default: [] },
    result: { type: Schema.Types.Mixed, default: null },
    attempts: { type: [attemptSchema], default: [] },
    receivedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  { minimize: false },
);

deliverySchema.index({ zapId: 1, githubDeliveryId: 1 }, { unique: true });
deliverySchema.index({ userId: 1, receivedAt: -1 });

export const DeliveryModel = model('Delivery', deliverySchema);
