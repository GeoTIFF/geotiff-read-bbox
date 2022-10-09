import test from "flug";
import * as GeoTIFF from "geotiff";
import readBoundingBox from "./index.mjs";

test("url", async ({ eq }) => {
  console.time("url");
  const url = "https://geoblaze.s3.amazonaws.com/wildfires.tiff";
  const geotiff = await GeoTIFF.fromUrl(url);
  const bbox = [-123.75, 39.909736234537185, -122.34375, 40.97989806962013];
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 4326,
    geotiff
  });
  eq(result.read_bbox, [-123.75439453125, 39.90673828124999, -122.33935546875, 40.98339843749999]);
  eq(result.srs_of_geotiff, 4326);
  eq(result.data.length, 3);
  eq(result.width, 322);
  eq(result.height, 245);
  console.timeEnd("url");
});

test("utm", async ({ eq }) => {
  console.time("utm");
  const url =
    "https://storage.googleapis.com/pdd-stac/disasters/hurricane-harvey/0831/20170831_172754_101c_3b_Visual.tif";
  const geotiff = await GeoTIFF.fromUrl(url);
  const bbox = [-95.33935546875, 28.92163128242129, -95.3173828125, 28.940861769405547];
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 4326,
    geotiff,
    use_overview: true,
    target_height: 256,
    target_width: 256
  });
  eq(result.selected_image_index, 2);
  eq(result.read_bbox, [271941, 3201507.449748141, 274131, 3203691.187814824]);
  eq(result.read_window, [11084, 13132, 11449, 12768]);
  eq(result.srs_of_geotiff, 32615);
  eq(result.data.length, 3);
  eq(result.width, 365);
  eq(result.height, 364);
  console.timeEnd("utm");
});

test("non-standard srs metadata (esri)", async ({ eq }) => {
  console.time("esri");
  const geotiff = await GeoTIFF.fromFile("./data/gadas.tif");
  const bbox = [80.068359375, 7.667441482726068, 80.947265625, 8.581021215641854];
  const result = await readBoundingBox({
    bbox,
    debugLevel: 1,
    srs: 4326,
    geotiff,
    use_overview: true,
    target_height: 256,
    target_width: 256
  });
  eq(result.selected_image_index, 0);
  eq(result.read_bbox, [8911945.370730668, 855453.5661287487, 9012230.751840793, 960630.9170491232]);
  eq(result.read_window, [496, 192, 537, 149]);
  eq(result.srs_of_geotiff, 3857);
  eq(result.data.length, 4);
  eq(result.width, 41);
  eq(result.height, 43);
  console.timeEnd("esri");
});
