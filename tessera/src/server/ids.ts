import { createHash, randomBytes } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I), so ids survive being read aloud or retyped.
const ID_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomString(alphabet: string, size: number): string {
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < size) {
    for (const byte of randomBytes(size * 2)) {
      if (byte < limit) {
        out += alphabet[byte % alphabet.length];
        if (out.length === size) break;
      }
    }
  }
  return out;
}

/** Unguessable identifier (about 93 bits), safe to use in share links. */
export function newId(size = 16): string {
  return randomString(ID_ALPHABET, size);
}

/** Short code a teacher can read out to a class. */
export function newJoinCode(): string {
  return randomString(CODE_ALPHABET, 7);
}

/** One-time token for emailed links. Store only its hash. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
