import { CHILD_AGE } from './constants';

/**
 * Age in whole years from a birth month and year. Only the month is known, so
 * the birthday is assumed to fall at the end of it: someone is never treated
 * as older than they might be.
 */
function ageFromBirth(birthYear: number, birthMonth: number, now = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return year - birthYear - (month <= birthMonth ? 1 : 0);
}

export function isChildBirth(birthYear: number | null | undefined, birthMonth: number | null | undefined, now = new Date()): boolean {
  if (!birthYear || !birthMonth) return false;
  return ageFromBirth(birthYear, birthMonth, now) < CHILD_AGE;
}
