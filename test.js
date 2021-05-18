const test = require("flug");
const GeoTIFF = require("geotiff");
const readBoundingBox = require("./index");

test("url", async ({ eq }) => {
  const url = "https://geoblaze.s3.amazonaws.com/wildfires.tiff";
  const geotiff = await GeoTIFF.fromUrl(url);
  const bbox = [-123.75, 39.909736234537185, -122.34375, 40.97989806962013];
  const result = await readBoundingBox({
    bbox,
    debug: false,
    srs: 4326,
    geotiff,
  });
  eq(result.read_bbox, [-123.75439453125, 39.90673828124999, -122.33935546875, 40.98339843749999]);
  eq(result.srs_of_geotiff, 4326);
  eq(result.data.length, 3);
  eq(result.width, 322);
  eq(result.height, 245);
});

test("utm", async ({ eq }) => {
  const url =
    "https://s3-us-west-2.amazonaws.com/planet-disaster-data/hurricane-harvey/SkySat_Freeport_s03_20170831T162740Z3.tif";
  const geotiff = await GeoTIFF.fromUrl(url);
  const bbox = [-95.33935546875, 28.92163128242129, -95.3173828125, 28.940861769405547];
  const result = await readBoundingBox({
    bbox,
    debug: false,
    srs: 4326,
    geotiff,
  });
  eq(result.read_bbox, [271940.8, 3201512.8000000003, 274126.4, 3203687.2]);
  eq(result.srs_of_geotiff, 32615);
  eq(result.data.length, 3);
  eq(result.width, 2732);
  eq(result.height, 2718);
});
