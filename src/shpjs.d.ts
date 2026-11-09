declare module 'shpjs' {
  /** Parse a zipped shapefile into GeoJSON (one FeatureCollection, or one per layer). */
  export default function shp(input: ArrayBuffer | string): Promise<unknown>;
}
