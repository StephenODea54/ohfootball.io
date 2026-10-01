/**
 * Places a point of the Web Mercator unit square on the map. x = scale × mx + x and
 * y = scale × my + y, in map units. The browser and the build can both place a school with it,
 * without d3.
 */
export interface MercatorFit {
  scale: number
  x: number
  y: number
}

/** The x of a longitude in the unit square of the Web Mercator projection. */
export function mercatorX(longitude: number) {
  return longitude / 360 + 0.5
}

/** The y of a latitude in the unit square of the Web Mercator projection. North is up. */
export function mercatorY(latitude: number) {
  const sin = Math.sin((latitude * Math.PI) / 180)
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
}

/** The place of a longitude and latitude on the map, in map units. */
export function project(fit: MercatorFit, longitude: number, latitude: number) {
  return {
    x: fit.scale * mercatorX(longitude) + fit.x,
    y: fit.scale * mercatorY(latitude) + fit.y,
  }
}
