type Rgb = [number, number, number];

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const ramp = (stops: string[]) => {
  const rgb = stops.map(hex);
  return (t: number): Rgb => {
    const x = Math.min(1, Math.max(0, t)) * (rgb.length - 1);
    const i = Math.min(rgb.length - 2, Math.floor(x));
    const f = x - i;
    const a = rgb[i] ?? [0, 0, 0];
    const b = rgb[i + 1] ?? a;
    const mix = (k: 0 | 1 | 2): number => Math.round(a[k] + (b[k] - a[k]) * f);
    return [mix(0), mix(1), mix(2)];
  };
};

export const inferno = ramp([
  "#000004",
  "#1b0c41",
  "#4a0c6b",
  "#781c6d",
  "#a52c60",
  "#cf4446",
  "#ed6925",
  "#fb9b06",
  "#fcffa4",
]);

export const prgn = ramp([
  "#40004b",
  "#762a83",
  "#9970ab",
  "#c2a5cf",
  "#e7d4e8",
  "#f7f7f7",
  "#d9f0d3",
  "#a6dba0",
  "#5aae61",
  "#1b7837",
  "#00441b",
]);

export const css = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`;

export const isDark = ([r, g, b]: Rgb): boolean =>
  0.2126 * r + 0.7152 * g + 0.0722 * b < 140;

/** Inferno clipped to [0.15, 0.85] so neither end vanishes on white or reads as text. */
export const sequential = (t: number): Rgb => inferno(0.85 - 0.7 * t);

export const sequentialRampCss = (): string =>
  `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
    .map((t) => css(sequential(t)))
    .join(", ")})`;
