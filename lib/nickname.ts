const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

/** Names that could pass for the project, its staff, or an operator (schema.md DATA-24). */
export const RESERVED_NICKNAMES = [
  'admin',
  'administrator',
  'mod',
  'moderator',
  'support',
  'team',
  'staff',
  'official',
  'pots',
  'potsteam',
  'system',
  'owner',
  'keeper',
]

export type NicknameResult = { ok: true; nickname: string; lower: string } | { ok: false }

/** Digits and underscores at the ends do not turn a reserved word into a different name. */
function reservedForm(lower: string): string {
  return lower.replace(/^[_0-9]+|[_0-9]+$/g, '')
}

export function validateNickname(raw: unknown): NicknameResult {
  if (typeof raw !== 'string' || !NICKNAME_PATTERN.test(raw)) {
    return { ok: false }
  }
  const lower = raw.toLowerCase()
  if (/^0x[0-9a-f]*$/.test(lower) || RESERVED_NICKNAMES.includes(reservedForm(lower))) {
    return { ok: false }
  }
  return { ok: true, nickname: raw, lower }
}
