import { limits } from '#/core/limits.ts';

export type Stroke = readonly (readonly [number, number])[];

export function encodeStrokes(strokes: readonly Stroke[]): string {
  const error = strokeListError(strokes);
  if (error) throw new Error(error);

  const length = strokes.reduce(
    (total, stroke) => total + 1 + stroke.length * 2,
    0,
  );
  const data = new Int16Array(length);
  let index = 0;
  for (const stroke of strokes) {
    data[index] = stroke.length;
    index += 1;
    for (const [x, y] of stroke) {
      data[index] = x;
      index += 1;
      data[index] = y;
      index += 1;
    }
  }
  return bytesToBase64(new Uint8Array(data.buffer));
}

export function decodeStrokes(packed: string): Int16Array {
  const error = validatePackedStrokes(packed);
  if (error) throw new Error(error);
  return decodePacked(packed);
}

export function validatePackedStrokes(packed: string): string | null {
  if (packed.length > limits.strokesBase64MaxChars) {
    return 'The signature has too much ink.';
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(packed);
  } catch {
    return 'The signature data is not valid.';
  }
  if (bytes.byteLength % 2 !== 0) {
    return 'The signature data is not valid.';
  }
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  return int16Error(new Int16Array(aligned.buffer));
}

function strokeListError(strokes: readonly Stroke[]): string | null {
  if (strokes.length > limits.drawnStrokes)
    return 'The signature has too many strokes.';
  let points = 0;
  for (const stroke of strokes) {
    if (stroke.length < 1)
      return 'A signature stroke needs at least one point.';
    points += stroke.length;
    if (points > limits.drawnPoints)
      return 'The signature has too many points.';
    for (const [x, y] of stroke) {
      if (!coordOk(x) || !coordOk(y)) {
        return 'A signature point is outside the capture area.';
      }
    }
  }
  return null;
}

function int16Error(data: Int16Array): string | null {
  let strokes = 0;
  let points = 0;
  let index = 0;
  while (index < data.length) {
    const count = data[index];
    index += 1;
    if (count < 1) return 'The signature data is not valid.';
    strokes += 1;
    points += count;
    if (strokes > limits.drawnStrokes || points > limits.drawnPoints) {
      return 'The signature is too large.';
    }
    if (index + count * 2 > data.length)
      return 'The signature data is not valid.';
    for (let point = 0; point < count; point += 1) {
      const x = data[index];
      const y = data[index + 1];
      index += 2;
      if (x === undefined || y === undefined || !coordOk(x) || !coordOk(y)) {
        return 'A signature point is outside the capture area.';
      }
    }
  }
  return null;
}

function coordOk(value: number): boolean {
  return (
    Number.isInteger(value) && value >= 0 && value <= limits.strokeCoordMax
  );
}

function decodePacked(packed: string): Int16Array {
  const bytes = base64ToBytes(packed);
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  return new Int16Array(aligned.buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(packed: string): Uint8Array {
  const binary = atob(packed);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
