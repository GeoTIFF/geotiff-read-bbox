const reprojectBoundingBox = require("reproject-bbox");

module.exports = async ({ bbox, debug = false, geotiff, srs }) => {
  const image = await geotiff.getImage();
  if (debug) console.log("[geotiff-clip] image:", typeof image);

  const [originX, originY] = image.getOrigin();
  if (debug) console.log("[geotiff-clip] originX:", originX);
  if (debug) console.log("[geotiff-clip] originY:", originY);

  const [resolutionX, resolutionY] = image.getResolution();
  if (debug) console.log("[geotiff-clip] resolutionX:", resolutionX);
  if (debug) console.log("[geotiff-clip] resolutionY:", resolutionY);

  const { geoKeys } = image;
  if (debug) console.log("[geotiff-clip] geoKeys:", geoKeys);
  const srs_of_geotiff = geoKeys.GeographicTypeGeoKey || geoKeys.ProjectedCSTypeGeoKey;
  if (debug) console.log("[geotiff-clip] srs_of_geotiff:", srs_of_geotiff);

  // convert bbox to spatial reference system of the geotiff
  const bbox_in_raster_srs = reprojectBoundingBox({ bbox, from: srs, to: srs_of_geotiff });
  if (debug) console.log("[geotiff-clip] bbox_in_raster_srs:", bbox_in_raster_srs);

  const left = (bbox_in_raster_srs[0] - originX) / resolutionX;
  const right = (bbox_in_raster_srs[2] - originX) / resolutionX;
  const top = (bbox_in_raster_srs[3] - originY) / resolutionY;
  const bottom = (bbox_in_raster_srs[1] - originY) / resolutionY;
  if (debug) console.log("[geotiff-clip] window before rounding:", JSON.stringify([left, top, right, bottom]));

  // we're rounding here, so we don't ask for half a pixel
  const leftInt = Math.floor(left);
  const rightInt = Math.ceil(right);
  const topInt = Math.floor(top);
  const bottomInt = Math.ceil(bottom);

  const readWindow = [leftInt, topInt, rightInt, bottomInt];
  if (debug) console.log("[geotiff-clip] readWindow:", readWindow);

  const data = await image.readRasters({ window: readWindow });
  if (debug) console.log("[geotiff-clip] data:", data);

  const { height, width } = data;

  // the actual bounding box that is read
  const read_bbox = [
    originX + leftInt * resolutionX, // xmin
    originY + bottomInt * resolutionY, // ymin
    originX + rightInt * resolutionX, // xmax
    originY + topInt * resolutionY, // ymax
  ];
  if (debug) console.log("[geotiff-clip] read_bbox:", read_bbox);

  return { data, srs_of_geotiff, read_bbox, height, width };
};
