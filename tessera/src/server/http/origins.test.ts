import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origins';

const production = { appUrl: 'https://tessera.example', appEnv: 'production' };
const preview = { appUrl: 'http://localhost:4300', appEnv: 'preview' };

describe('allowed origins', () => {
  it('accepts only APP_URL in production', () => {
    expect(isAllowedOrigin('https://tessera.example', ['tessera.example'], production)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', ['evil.example'], production)).toBe(false);
  });

  it('accepts a preview opened through another address, but only for its own host', () => {
    expect(isAllowedOrigin('https://abc.preview.example', ['localhost:4300', 'abc.preview.example'], preview)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', ['abc.preview.example'], preview)).toBe(false);
    expect(isAllowedOrigin('not a url', ['abc.preview.example'], preview)).toBe(false);
  });
});
