import { writeFileSync } from "node:fs";
import test from "flug";
import * as GeoTIFF from "geotiff";
import Geotransform from "geoaffine/Geotransform.js";
import getPreciseBoundingBox from "geotiff-precise-bbox";
import srvd from "srvd";
import writeImage from "write-image";
import { default as readBoundingBox, snap_to_read_window } from "./index.mjs";

const writeResult = (result, filepath) => {
  let { data } = result;
  if (data.length === 1) data = [data[0], data[0], data[0]];
  const { data: buf } = writeImage({ data, height: result.height, format: "PNG", width: result.width });
  writeFileSync(`./test-output/${filepath}.png`, buf);
};

const getBoundingBox = img => getPreciseBoundingBox(img);

// snap image coordinate bounding box in form [left, top, right, bottom] from top-left corner
test("snap_to_read_window", ({ eq }) => {
  eq(snap_to_read_window([496.5002, 149.7378, 536.5002, 191.7378]), [496, 149, 537, 192]);
  eq(snap_to_read_window([22168.1038, 25534.3426, 22896.245, 26258.8882]), [22168, 25534, 22897, 26259]);
});

test("exact fit", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/wildfires.tiff");
  const image = await geotiff.getImage();
  const bbox = getBoundingBox(image).map(n => Number(n)); // [-123.7412109375, 38.85205078124999, -119.1181640625, 42.29736328124999]
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 4326,
    geotiff,
    use_overview: false
  });
  eq(result.read_bbox, [-123.7412109375, 38.85205078124999, -119.1181640625, 42.29736328124999]);
  eq(result.geotransform, [-123.7412109375, 0.00439453125, 0, 42.29736328124999, 0, -0.00439453125]);
  eq(result.srs_of_geotiff, 4326);
  eq(result.srs, "EPSG:4326");
  eq(result.data.length, 3);
  eq(result.width, 1052);
  eq(result.height, 784);
  eq(Geotransform(result.geotransform).forward([1052, 784]), [-119.1181640625, 38.85205078124999]);
  writeResult(result, "wildfires");
});

test("no overviews", async ({ eq }) => {
  // prefer lower resolution but there are no overviews for this image
  const geotiff = await GeoTIFF.fromFile("./data/umbra_mount_yasur.tiff");
  const image = await geotiff.getImage();
  const height = image.getHeight();
  const width = image.getWidth();
  const bbox = getBoundingBox(image);
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 32759,
    geotiff,
    target_height: Math.round(height / 2),
    target_width: Math.round(width / 2),
    use_overview: true
  });
  eq(result.geotransform, [338271.33870189486, -0.14299987236417117, -0.5767759114507439, 7840721.472052763, -0.5767759114507457, 0.14299987236414916]);
  eq(result.read_bbox, [336158.0770006143, 7839028.057976743, 338271.33870189486, 7841141.319678024]);
  eq(result.srs_of_geotiff, 32759);
  eq(result.srs, "EPSG:32759");
  eq(result.data.length, 1);
  eq(result.width, 2936);
  eq(result.height, 2936);
  writeResult(result, "umbra_mount_yasur");
});

test("url", async ({ eq }) => {
  const { port, server } = srvd.serve();
  const url = `http://localhost:${port}/data/wildfires.tiff`;
  const geotiff = await GeoTIFF.fromUrl(url);
  const bbox = [-123.75, 39.909736234537185, -122.34375, 40.97989806962013];
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 4326,
    geotiff
  });
  eq(result.geotransform, [-123.75, 0.00439453125, 0, 40.98339843749999, 0, -0.00439453125]);
  eq(result.read_bbox, [-123.75, 39.90673828124999, -122.34375, 40.98339843749999]);
  eq(result.srs_of_geotiff, 4326);
  eq(result.srs, "EPSG:4326");
  eq(result.data.length, 3);
  eq(result.width, 320);
  eq(result.height, 245);

  writeResult(result, "wildfires");
  await server.close();
});

test("utm", async ({ eq }) => {
  const url = "https://storage.googleapis.com/pdd-stac/disasters/hurricane-harvey/0831/20170831_172754_101c_3b_Visual.tif";
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
  eq(result.geotransform, [271941, 6, 0, 3203691.187814824, 0, -5.999280402974334]);
  eq(result.selected_image_index, 1);
  eq(await geotiff.getImage(result.index), result.image);
  eq(result.read_bbox, [271941, 3201507.449748141, 274131, 3203691.187814824]);
  eq(result.read_window, [11084, 13132, 11449, 12768]);
  eq(result.window, [11084, 12768, 11449, 13132]);
  eq(result.srs_of_geotiff, 32615);
  eq(result.srs, "EPSG:32615");
  eq(result.data.length, 3);
  eq(result.width, 365);
  eq(result.height, 364);

  // all zeros because bbox outside image
  eq(
    result.data.every(band => new Set(band).size === 1),
    true
  );
  writeResult(result, "utm");
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
  eq(result.geotransform, [8911945.370730668, 2445.9849051249894, 0, 960630.9170491232, 0, -2445.98490512499]);
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
  const geotiff = await GeoTIFF.fromUrl("https://maxar-ard-samples.s3.amazonaws.com/v3/australia_vineyards/50/213133231011/2019-10-07/10500100191CD200-visual.tif");
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
  writeResult(result, "skip_transparency");
  delete result.data;
  delete result.image;
  eq(result, {
    base_window: [2624, -320, 16128, 6144],
    bbox: [315644.53125, 6238281.25, 319765.625, 6240253.90625],
    geotransform: [315644.53125, 19.53125, 0, 6240253.90625, 0, -19.53125],
    height: 101,
    index: 7,
    simple_bbox: [2624, 11264, 16128, 17728],
    srs: "EPSG:32750",
    width: 211,
    window: [41, -5, 252, 96]
  });
});

test("eu_pasture.tiff", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/eu_pasture.tiff");
  const bbox = [0, 0, 180, 90]; // north-east quarter
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: 4326,
    geotiff,
    use_overview: true,
    target_height: 512,
    target_width: 512
  });
  writeResult(
    {
      ...result,
      data: [result.data[0].map(n => Math.round(255 * n))]
    },
    "eu_pasture"
  );
  delete result.data;
  delete result.image;
  eq(result, {
    base_window: [377, -111, 2538, 970],
    bbox: [-0.04222557813090688, -0.029977027635510467, 180.03012267186912, 90.0478612223645],
    geotransform: [-0.04222557813090688, 0.08332825, 0, 90.0478612223645, 0, -0.08332825],
    height: 1081,
    index: 0,
    simple_bbox: [377, -332, 2538, 749],
    srs: "EPSG:4326",
    width: 2161,
    window: [377, -111, 2538, 970]
  });
});

test("example", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromUrl("https://maxar-ard-samples.s3.amazonaws.com/v3/australia_vineyards/50/213133231011/2019-10-07/10500100191CD200-visual.tif");

  const result = await readBoundingBox({
    // bbox for tile: https://a.tile.openstreetmap.org/11/1678/1229.png
    bbox: [114.9609375, -34.016241889667015, 115.13671875, -33.87041555094183],
    debugLevel: 0,
    srs: 4326,
    geotiff,
    use_overview: true,
    target_height: 512,
    target_width: 512
  });
  writeResult(result, "example");
  delete result.data;
  delete result.image;
  eq(result, {
    base_window: [-11328, -34432, 43008, 19648],
    bbox: [311386.71875, 6234160.15625, 327968.75, 6250664.0625],
    geotransform: [311386.71875, 19.53125, 0, 6250664.0625, 0, -19.53125],
    height: 845,
    index: 7,
    simple_bbox: [-11328, -2240, 43008, 51840],
    srs: "EPSG:32750",
    width: 849,
    window: [-177, -538, 672, 307]
  });
});

test("simple", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/vestfold.tif");
  const result = await readBoundingBox({
    bbox: [128, 656, 256, 784],
    debugLevel: 0,
    srs: "simple",
    geotiff,
    use_overview: true
  });
  eq(result.data.length, 1);
  eq(result.data[0].length, 16384);
  writeResult(result, "simple");
});

test("simple gadas", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/gadas.tif");
  const height = 700;
  const width = 690;
  const bbox = [10, -75, 10 + width, -75 + height];
  const image = await geotiff.getImage();
  const result = await readBoundingBox({
    bbox,
    debugLevel: 0,
    srs: "simple",
    geotiff,
    use_overview: true
  });
  eq(result.data.length, 4);
  eq(result.data[0].length, width * height);
  eq(result.srs, "EPSG:3857");
  eq(result.bbox, [7723196.706839923, -20209.029905997682, 9410926.291376166, 1691980.4036814952]);
  eq(result.window, [10, -150, 700, 550]);
  eq(result.read_window, [10, 550, 700, -150]);
  writeResult(result, "simple_gadas");
});

test("simple gadas [256, 256, 512, 512]", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/gadas.tif");
  const image = await geotiff.getImage();
  const [xmin, ymin, xmax, ymax] = image.getBoundingBox();

  const result = await readBoundingBox({
    bbox: [256, 256, 512, 512],
    debug_level: 10,
    srs: "simple",
    geotiff,
    use_overview: true
  });

  eq(result.index, 0);
  eq(result.height, 256);
  eq(result.width, 256);
  // image is only 475 pixels tall, so 512 is above top edge
  eq(result.window, [256, -37, 512, 219]);
  eq(result.bbox[0] > xmin, true);
  eq(result.bbox[1] > ymin, true);
  eq(result.bbox[2] > xmin, true);
  eq(result.bbox[3] > ymax, true);
  writeResult(result, "simple_gadas_2");
});

test("simple wildfires", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromFile("./data/wildfires.tiff");
  const image = await geotiff.getImage();
  console.log("image bbox:", image.getBoundingBox());

  const height = 784;
  const width = 1052;
  // shifted left and up 50
  const shift = 50;
  const result = await readBoundingBox({
    bbox: [-1 * shift, shift, width - shift, height + shift],
    debug_level: 0,
    srs: "simple",
    geotiff,
    use_overview: false
  });

  eq(result.index, 0);
  eq(result.height, height);
  eq(result.width, width);
  eq(result.window, [-50, -50, 1002, 734]); // y-axis is flipped in image coordinates
  eq(result.bbox, [-123.9609375, 39.07177734374999, -119.337890625, 42.51708984374999]);
  writeResult(result, "simple_wildfires");
});

test("base read pixel info", async ({ eq }) => {
  const port = 8081;
  const { server } = srvd.serve({ port });

  const geotiff = await GeoTIFF.fromUrl(`http://localhost:${port}/data/vestfold.tif`);

  const params = {
    bbox: [128, 656, 144, 672],
    debugLevel: 3,
    srs: "simple",
    geotiff,
    use_overview: true,
    target_height: 256,
    target_width: 256
  };

  const result = await readBoundingBox(params);

  eq(result.base_window, [128, 208, 144, 224]);
  eq(result.bbox, [2305536, 488520, 2306048, 489032]);
  eq(result.geotransform, [2305536, 32, 0, 489032, 0, -32]);
  eq(result.height, 16);
  eq(result.index, 0);
  eq(result.width, 16);
  eq(result.window, [128, 208, 144, 224]);

  await server.close();
});

test("custom srs", async ({ eq }) => {
  const geotiff = await GeoTIFF.fromUrl("https://maxar-ard-samples.s3.amazonaws.com/v3/australia_vineyards/50/213133231011/2019-10-07/10500100191CD200-visual.tif");

  const result = await readBoundingBox({
    // bbox for tile: https://a.tile.openstreetmap.org/11/1678/1229.png
    bbox: [114.9609375, -34.016241889667015, 115.13671875, -33.87041555094183],
    debugLevel: 0,
    srs: `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`,
    geotiff,
    geotiff_srs: "+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs +type=crs",
    use_overview: true,
    target_height: 512,
    target_width: 512
  });
  writeResult(result, "example");
  delete result.data;
  delete result.image;
  eq(result, {
    base_window: [-11328, -34432, 43008, 19648],
    bbox: [311386.71875, 6234160.15625, 327968.75, 6250664.0625],
    geotransform: [311386.71875, 19.53125, 0, 6250664.0625, 0, -19.53125],
    height: 845,
    index: 7,
    simple_bbox: [-11328, -2240, 43008, 51840],
    srs: "+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs +type=crs",
    width: 849,
    window: [-177, -538, 672, 307]
  });
});
