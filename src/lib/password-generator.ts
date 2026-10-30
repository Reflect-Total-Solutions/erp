/**
 * Cryptographically secure random password generation.
 * Compatible with both browser (client-side) and Node.js environments.
 */
export function generateSecurePassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // omitted I, O
  const lower = "abcdefghijkmnopqrstuvwxyz"; // omitted l
  const numbers = "23456789"; // omitted 0, 1
  const symbols = "!@#$%&*_-+=";
  const all = upper + lower + numbers + symbols;

  const randomBytes = new Uint32Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    // Fallback for environments where Web Crypto isn't global
    for (let i = 0; i < length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  // Guarantee at least one of each character class
  const chars = [
    upper[randomBytes[0] % upper.length],
    lower[randomBytes[1] % lower.length],
    numbers[randomBytes[2] % numbers.length],
    symbols[randomBytes[3] % symbols.length],
  ];

  for (let i = 4; i < length; i++) {
    chars.push(all[randomBytes[i] % all.length]);
  }

  // Shuffle with Fisher-Yates using random values
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes[i] % (i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join("");
}
