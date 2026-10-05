export const MAX_BODY_LENGTH = 280

// C0 and C1 control characters, except nothing: a chat message is one block of plain text.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g

/**
 * The text to store, or null when the message is empty or too long after cleaning. Trims, applies
 * NFC, strips control characters (a line break is kept as a space), and counts characters the way a
 * reader does (code points), so an emoji is not rejected as two characters.
 */
export function normalizeBody(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CONTROL, '')
    .trim()
  const length = Array.from(cleaned).length
  if (length < 1 || length > MAX_BODY_LENGTH) {
    return null
  }
  return cleaned
}
