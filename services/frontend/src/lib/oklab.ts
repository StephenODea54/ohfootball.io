/**
 * Colors in OKLab, the perceptual color space of Björn Ottosson
 * (https://bottosson.github.io/posts/oklab/). In OKLab, an equal distance looks like an equal
 * change of color. The matrices below are the ones in that article.
 */

/** A color in OKLab. `l` is the lightness from 0 for black to 1 for white. */
export interface Oklab {
  l: number
  a: number
  b: number
}

/** A channel of linear sRGB has this much room past 0 and 1 and still counts as in the gamut. */
const GAMUT_EPSILON = 1e-6

/** The steps of the search for the largest chroma in the gamut. 2^-24 of the chroma is enough. */
const GAMUT_STEPS = 24

/** An sRGB channel from 0 to 1, without its gamma. */
function toLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** A linear sRGB channel from 0 to 1, with its gamma. */
function toGamma(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

/** The linear sRGB channels of an OKLab color. A channel out of 0 to 1 is out of the gamut. */
function toLinearRgb({ l, a, b }: Oklab): [number, number, number] {
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
}

/** The OKLab color of a #rrggbb color. */
export function hexToOklab(hex: string): Oklab {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    toLinear(Number.parseInt(hex.slice(start, start + 2), 16) / 255),
  ) as [number, number, number]
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  return {
    l: 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    a: 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    b: 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  }
}

/**
 * The #rrggbb color of an OKLab color. A channel out of the gamut is cut to 0 or 1, so use
 * `toGamut` first to keep the hue. The result is made only from numbers.
 */
export function oklabToHex(color: Oklab): string {
  return `#${toLinearRgb(color)
    .map((channel) => {
      const value = Math.round(toGamma(Math.min(1, Math.max(0, channel))) * 255)
      return value.toString(16).padStart(2, "0")
    })
    .join("")}`
}

/** The OKLab color of a lightness, a chroma, and a hue in degrees, as CSS oklch() takes them. */
export function fromOklch(l: number, chroma: number, hue: number): Oklab {
  const angle = (hue * Math.PI) / 180
  return { l, a: chroma * Math.cos(angle), b: chroma * Math.sin(angle) }
}

/** The chroma of a color: 0 for a gray, and larger for a more vivid color. */
export function chroma({ a, b }: Oklab) {
  return Math.hypot(a, b)
}

/** True when sRGB can show the color. */
export function inGamut(color: Oklab) {
  return toLinearRgb(color).every(
    (channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON,
  )
}

/**
 * The color with the same lightness and hue and the largest chroma that sRGB can show. A binary
 * search finds the chroma. A gray is always in the gamut for a lightness from 0 to 1, so the
 * search always ends in the gamut.
 */
export function toGamut(color: Oklab): Oklab {
  if (inGamut(color)) return color
  const scaled = (factor: number) => ({ l: color.l, a: color.a * factor, b: color.b * factor })
  let low = 0
  let high = 1
  for (let step = 0; step < GAMUT_STEPS; step++) {
    const middle = (low + high) / 2
    if (inGamut(scaled(middle))) low = middle
    else high = middle
  }
  return scaled(low)
}

/** The distance between two colors in OKLab. 0 is the same color. */
export function distance(first: Oklab, second: Oklab) {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b)
}
