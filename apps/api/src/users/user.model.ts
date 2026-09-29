import { model, Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    login: { type: String, required: true },
    name: { type: String, default: null },
    avatarUrl: { type: String, required: true },
    accessToken: { type: String, required: true },
    scopes: { type: [String], default: [] },
    copilotProvider: { type: String, default: null },
    copilotKey: { type: String, default: null },
    copilotKeyHint: { type: String, default: null },
  },
  { timestamps: true },
);

export type UserRecord = InferSchemaType<typeof userSchema>;

export const UserModel = model('User', userSchema);
