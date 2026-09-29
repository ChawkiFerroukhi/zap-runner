import { model, Schema } from 'mongoose';

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const SessionModel = model('Session', sessionSchema);
