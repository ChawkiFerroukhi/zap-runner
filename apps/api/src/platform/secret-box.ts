import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';
const IV_BYTES = 12;

export interface SecretBox {
  seal(plaintext: string): string;
  open(sealed: string): string;
}

export function createSecretBox(key: Buffer): SecretBox {
  return {
    seal(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [FORMAT_VERSION, iv, tag, ciphertext].map(encodePart).join('.');
    },

    open(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split('.');
      if (version !== FORMAT_VERSION || !iv || !tag || ciphertext === undefined) {
        throw new Error('Unrecognised sealed value');
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

function encodePart(part: string | Buffer): string {
  return typeof part === 'string' ? part : part.toString('base64url');
}
