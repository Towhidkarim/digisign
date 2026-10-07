import { limits } from '#/core/limits.ts';

export const MICRO = limits.micro;

export type Box = readonly [number, number, number, number];
export type Rotate = 0 | 90 | 180 | 270;

export type PageGeometry = {
  mediaBox: Box;
  cropBox: Box;
  rotate: Rotate;
};

export type MicroRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function viewBox(page: PageGeometry): Box {
  const [ax0, ay0, ax1, ay1] = page.mediaBox;
  const [bx0, by0, bx1, by1] = page.cropBox;
  return [
    Math.max(ax0, bx0),
    Math.max(ay0, by0),
    Math.min(ax1, bx1),
    Math.min(ay1, by1),
  ];
}

export function viewSize(page: PageGeometry): { viewW: number; viewH: number } {
  const [vx0, vy0, vx1, vy1] = viewBox(page);
  const bw = vx1 - vx0;
  const bh = vy1 - vy0;
  if (page.rotate === 90 || page.rotate === 270) {
    return { viewW: bh, viewH: bw };
  }
  return { viewW: bw, viewH: bh };
}

export function microToView(micro: number, extent: number): number {
  return (micro / MICRO) * extent;
}

export const FOOTER_STRIP_PT = 36;

export function microToPercent(micro: number): number {
  return micro / 10_000;
}

export function footerStripMicro(page: PageGeometry): number {
  const { viewH } = viewSize(page);
  if (!(viewH > 0)) return MICRO;
  return clampMicro(Math.round((FOOTER_STRIP_PT / viewH) * MICRO));
}

export function ptToMicro(pt: number, viewExtent: number): number {
  if (!(viewExtent > 0)) return 1;
  return Math.max(1, Math.round((pt / viewExtent) * MICRO));
}

export function pointerToMicro(
  pointer: number,
  origin: number,
  size: number,
): number {
  if (size <= 0) return 0;
  const ratio = (pointer - origin) / size;
  return clampMicro(Math.round(ratio * MICRO));
}

export function cssDeltaToMicro(deltaPx: number, cssExtent: number): number {
  if (!(cssExtent > 0) || deltaPx === 0) return 0;
  const micro = Math.round((deltaPx / cssExtent) * MICRO);
  if (deltaPx > 0) return Math.max(1, micro);
  return Math.min(-1, micro);
}

export function clampMicro(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MICRO, Math.max(0, Math.round(value)));
}

export function viewMicroToPdf(
  page: PageGeometry,
  xMicro: number,
  yMicro: number,
): { x: number; y: number } {
  const [vx0, vy0, vx1, vy1] = viewBox(page);
  const { viewW, viewH } = viewSize(page);
  const u = microToView(xMicro, viewW);
  const v = microToView(yMicro, viewH);
  switch (page.rotate) {
    case 0:
      return { x: vx0 + u, y: vy1 - v };
    case 90:
      return { x: vx0 + v, y: vy0 + u };
    case 180:
      return { x: vx1 - u, y: vy0 + v };
    case 270:
      return { x: vx1 - v, y: vy1 - u };
  }
}

export function fieldToPdfRect(
  page: PageGeometry,
  field: MicroRect,
): { x: number; y: number; w: number; h: number } {
  const topLeft = viewMicroToPdf(page, field.x, field.y);
  const bottomRight = viewMicroToPdf(
    page,
    field.x + field.w,
    field.y + field.h,
  );
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);
  return {
    x,
    y,
    w: Math.abs(bottomRight.x - topLeft.x),
    h: Math.abs(bottomRight.y - topLeft.y),
  };
}

export function containFit(
  contentW: number,
  contentH: number,
  fieldW: number,
  fieldH: number,
): { x: number; y: number; w: number; h: number } {
  const pad = 0.04 * Math.min(fieldW, fieldH);
  const innerW = Math.max(0, fieldW - pad * 2);
  const innerH = Math.max(0, fieldH - pad * 2);
  if (contentW <= 0 || contentH <= 0 || innerW <= 0 || innerH <= 0) {
    return { x: fieldW / 2, y: fieldH / 2, w: 0, h: 0 };
  }
  const scale = Math.min(innerW / contentW, innerH / contentH);
  const w = contentW * scale;
  const h = contentH * scale;
  return {
    x: (fieldW - w) / 2,
    y: (fieldH - h) / 2,
    w,
    h,
  };
}
