/** Helpers that turn loosely-typed payloads from external systems into clean values. */

export type RawRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed string limited to `max` characters; undefined for empty or non-text values. */
export function text(value: unknown, max: number): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).slice(0, max);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** First non-empty text among several possible field names. */
export function pickText(source: RawRecord, keys: string[], max: number): string | undefined {
  for (const key of keys) {
    const value = text(source[key], max);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function amount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Parses a date sent by an external system.
 * A value without a time zone ("2026-11-10T23:59:00") is taken as local time of
 * the business, given by `defaultOffset` (for example "+03:00"), not as UTC.
 */
export function dateTime(value: unknown, defaultOffset: string): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  let candidate = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    candidate = `${candidate}T00:00:00`;
  }

  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(candidate);
  const parsed = new Date(hasZone ? candidate : `${candidate}${defaultOffset}`);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Brings a phone number to "+<digits>" so the same number written differently
 * ("8 (978) 000-00-00", "+7 978 000 00 00") is recognised as one.
 */
export function normalizePhone(value: unknown): string | undefined {
  const raw = text(value, 40);

  if (!raw) {
    return undefined;
  }

  let digits = raw.replace(/\D/g, '');

  if (digits.length < 10 || digits.length > 15) {
    return raw;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `7${digits}`;
  }

  return `+${digits}`;
}

export function normalizeEmail(value: unknown): string | undefined {
  const raw = text(value, 200)?.toLowerCase();

  return raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : undefined;
}
