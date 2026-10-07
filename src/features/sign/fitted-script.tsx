import { useLayoutEffect, useRef, useState } from 'react';

export function FittedScript({
  text,
  family,
  className,
}: {
  text: string;
  family: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(16);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled || !boxRef.current) return;
      const node = boxRef.current;
      const style = getComputedStyle(node);
      const padX =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const padY =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const innerW = Math.max(1, node.clientWidth - padX);
      const innerH = Math.max(1, node.clientHeight - padY);
      const probe = 100;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = `${probe}px "${family}"`;
      const metrics = context.measureText(text);
      const inkW = Math.max(metrics.width, 1) / probe;
      const inkH =
        Math.max(
          (metrics.actualBoundingBoxAscent || probe * 0.75) +
            (metrics.actualBoundingBoxDescent || probe * 0.25),
          1,
        ) / probe;
      setFontSize(fontSizeForBox(innerW, innerH, inkW, inkH));
    };
    measure();
    void document.fonts.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text, family]);

  return (
    <span
      ref={boxRef}
      className={`flex items-center justify-center overflow-hidden ${className ?? ''}`}
    >
      <span
        className="whitespace-nowrap leading-none"
        style={{ fontFamily: family, fontSize }}
      >
        {text}
      </span>
    </span>
  );
}

export function fontSizeForBox(
  boxW: number,
  boxH: number,
  inkWidthAtSize1: number,
  inkHeightAtSize1: number,
): number {
  const inset = Math.min(boxW, boxH) * 0.06;
  const availableW = Math.max(1, boxW - inset * 2);
  const availableH = Math.max(1, boxH - inset * 2);
  return Math.min(availableW / inkWidthAtSize1, availableH / inkHeightAtSize1);
}
