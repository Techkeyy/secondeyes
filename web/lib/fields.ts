import { MAX_INSTRUCTION_LEN } from './config';

const INSTRUCTION_PUNCT = " .,:;#$%()/_'-";
const PURPOSE_PUNCT = ' .,:#_-';

const isAlnum = (c: string) => /^[A-Za-z0-9]$/.test(c);

function describe(c: string): string {
  if (c === '\n' || c === '\r') return 'a line break';
  if (c === '\t') return 'a tab';
  if (c === '"') return 'the double quote (")';
  return `the character "${c}"`;
}

/** Same rule as the contract: 1..=500 chars of [A-Za-z0-9 .,:;#$%()/_'-]. Null when valid. */
export function instructionError(text: string): string | null {
  const chars = [...text];
  if (chars.length === 0) return 'Write what the agent may pay for.';
  if (chars.length > MAX_INSTRUCTION_LEN) {
    return `Too long: ${chars.length} of ${MAX_INSTRUCTION_LEN} characters. Shorten it by ${chars.length - MAX_INSTRUCTION_LEN}.`;
  }
  const i = chars.findIndex((c) => !isAlnum(c) && !INSTRUCTION_PUNCT.includes(c));
  if (i >= 0) {
    return `${describe(chars[i])} at position ${i + 1} is not allowed. Use letters A-Z, digits 0-9, spaces and . , : ; # $ % ( ) / _ ' -`;
  }
  return null;
}

/** What a careful agent must do before sending `purpose` to the contract: charset, then 64 chars. */
export function sanitisePurpose(text: string): string {
  return [...text]
    .filter((c) => isAlnum(c) || PURPOSE_PUNCT.includes(c))
    .join('')
    .slice(0, 64)
    .trim();
}

export function isAccountId(s: string): boolean {
  return s.length >= 2 && s.length <= 64 && /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(s);
}
