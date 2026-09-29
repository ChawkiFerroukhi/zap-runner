import mongoose from 'mongoose';

export async function connectDatabase(url: string): Promise<void> {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 5_000 });
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
