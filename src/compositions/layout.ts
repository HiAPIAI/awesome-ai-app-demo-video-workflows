export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
function even(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export function screenRect(width: number, height: number): ContentRect {
  const portrait = height > width;
  const contentWidth = even(width * (portrait ? 0.88 : 0.82));
  const contentHeight = even(height * (portrait ? 0.72 : 0.76));
  return {
    x: Math.floor((width - contentWidth) / 2),
    y: Math.floor((height - contentHeight) / 2),
    width: contentWidth,
    height: contentHeight,
  };
}

export function comparisonRects(width: number, height: number): [ContentRect, ContentRect] {
  const portrait = height > width;
  if (portrait) {
    const contentWidth = even(width * 0.82);
    const contentHeight = even(height * 0.34);
    const gap = even(height * 0.045);
    const top = Math.floor((height - contentHeight * 2 - gap) / 2);
    return [
      {x: Math.floor((width - contentWidth) / 2), y: top, width: contentWidth, height: contentHeight},
      {
        x: Math.floor((width - contentWidth) / 2),
        y: top + contentHeight + gap,
        width: contentWidth,
        height: contentHeight,
      },
    ];
  }
  const contentWidth = even(width * 0.4);
  const contentHeight = even(height * 0.66);
  const gap = even(width * 0.045);
  const left = Math.floor((width - contentWidth * 2 - gap) / 2);
  return [
    {x: left, y: Math.floor((height - contentHeight) / 2), width: contentWidth, height: contentHeight},
    {
      x: left + contentWidth + gap,
      y: Math.floor((height - contentHeight) / 2),
      width: contentWidth,
      height: contentHeight,
    },
  ];
}
