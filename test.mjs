import { writeFileSync } from "node:fs";
import test from "flug";
import * as GeoTIFF from "geotiff";
import writeImage from "write-image";
import readBoundingBox from "./index.mjs";

const writeResult = (result, filepath) => {
  const { data: buf } = writeImage({ data: result.data, height: result.height, format: "PNG", width: result.width });
  writeFileSync(`./test-output/${filepath}.png`, buf);
};

test("url", async ({ eq }) => {
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

  writeResult(result, "wildfires");
});

test("utm", async ({ eq }) => {
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
  eq(result.selected_image_index, 1);
  eq(await geotiff.getImage(result.selected_image_index), result.selected_image);
  eq(result.read_bbox, [271941, 3201507.449748141, 274131, 3203691.187814824]);
  eq(result.read_window, [11084, 13132, 11449, 12768]);
  eq(result.srs_of_geotiff, 32615);
  eq(result.data.length, 3);
  eq(result.width, 365);
  eq(result.height, 364);

  // all zeros because bbox outside image
  eq(
    result.data.every(band => new Set(band).size === 1),
    true
  );
});

test("non-standard srs metadata (esri)", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/gadas.tif");
  const bbox = [80.068359375, 7.667441482726068, 80.947265625, 8.581021215641854];
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
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
  writeResult(result, "gadas");
});

test("skip transparency masks", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromUrl(
    "https://maxar-ard-samples.s3.amazonaws.com/v3/australia_vineyards/50/213133231011/2019-10-07/10500100191CD200-visual.tif"
  );
  const bbox = [12802284.9934276, -4026091.1538368035, 12807176.963237852, -4023811.776507525];
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 3857,
    geotiff,
    use_overview: true,
    target_height: 60,
    target_width: 128
  });
  writeResult(result, "ard");
});
