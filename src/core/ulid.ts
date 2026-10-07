const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now = Date.now()): string {
  let time = now;
  let timePart = '';
  for (let index = 0; index < 10; index += 1) {
    timePart = ENCODING[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let randomPart = '';
  for (const byte of bytes) {
    randomPart += ENCODING[byte % 32];
  }
  return timePart + randomPart;
}
