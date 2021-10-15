const reprojectBoundingBox = require("reproject-bbox");
const snap = require("snap-bbox");

module.exports = async ({ bbox, debugLevel = 0, geotiff, srs, use_overview = false, target_height, target_width }) => {
  if (debugLevel >= 1) console.time("[geotiff-read-bbox]");
  if (debugLevel >= 2) console.time("[geotiff-read-bbox] getting first image");
  const image = await geotiff.getImage();
  if (debugLevel >= 2) console.timeEnd("[geotiff-read-bbox] getting first image");

  const imageHeight = image.getHeight();
  const imageWidth = image.getWidth();
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] imageHeight:", imageHeight);
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] imageWidth:", imageWidth);

  const origin = image.getOrigin();
  const [originX, originY] = origin;
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] originX:", originX);
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] originY:", originY);

  const resolution = image.getResolution();
  const [resolutionX, resolutionY] = resolution;
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] resolutionX:", resolutionX);
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] resolutionY:", resolutionY);

  const { geoKeys } = image;
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] geoKeys:", geoKeys);
  const srs_of_geotiff = geoKeys.GeographicTypeGeoKey || geoKeys.ProjectedCSTypeGeoKey;
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] srs_of_geotiff:", srs_of_geotiff);

  // convert bbox to spatial reference system of the geotiff
  const bbox_in_raster_srs = reprojectBoundingBox({ bbox, from: srs, to: srs_of_geotiff });
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] bbox_in_raster_srs:", bbox_in_raster_srs);

  let { bbox_in_coordinate_system: read_bbox, bbox_in_grid_cells: read_window } = snap({
    bbox: bbox_in_raster_srs,
    debug: debugLevel >= 3,
    origin,
    scale: resolution
  });
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] readWindow:", read_window);

  const height = read_window[1] - read_window[3];
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] height:", height);

  const width = read_window[2] - read_window[0];
  if (debugLevel >= 2) console.log("[geotiff-read-bbox] width:", width);

  // see if we can find a better image
  let selected_image = image;
  let selected_image_index = 0;
  if (use_overview && target_height && target_width) {
    // figure out ratio between actual raw width and desired width
    if (debugLevel >= 2) console.time("[geotiff-read-bbox] getting image count");
    const imageCount = await geotiff.getImageCount();
    if (debugLevel >= 2) console.timeEnd("[geotiff-read-bbox] getting image count");
    if (debugLevel >= 2) console.log("[geotiff-read-bbox] imageCount:", imageCount);

    for (let i = 1; i < imageCount; i++) {
      const subimage = await geotiff.getImage(i);
      selected_image_index = i;

      const ratioX = subimage.getHeight() / imageHeight;
      if (debugLevel >= 3) console.log("[geotiff-read-bbox] ratioX:", ratioX);

      const ratioY = subimage.getWidth() / imageWidth;
      if (debugLevel >= 3) console.log("[geotiff-read-bbox] ratioY:", ratioY);

      const subImageHeight = height * ratioY;
      const subImageWidth = width * ratioX;
      if (debugLevel >= 3) console.log("[geotiff-read-bbox] subImageHeight:", subImageHeight);
      if (debugLevel >= 3) console.log("[geotiff-read-bbox] subImageWidth:", subImageWidth);

      if (subImageHeight >= target_height && subImageWidth >= target_width) {
        selected_image = subimage;

        const subResolutionX = resolutionX / ratioX;
        const subResolutionY = resolutionY / ratioY;
        const subResolution = [subResolutionX, subResolutionY];

        ({ bbox_in_coordinate_system: read_bbox, bbox_in_grid_cells: read_window } = snap({
          bbox: bbox_in_raster_srs,
          debug: debugLevel >= 3,
          origin,
          scale: subResolution
        }));
        if (debugLevel >= 2) console.log("[geotiff-read-bbox] new read_bbox:", read_bbox);
        if (debugLevel >= 2) console.log("[geotiff-read-bbox] new read_window:", read_window);
      } else {
        break;
      }
    }
  }

  if (debugLevel >= 2) console.log("[geotiff-read-bbox] final read window:", read_window);
  const [left, bottom, right, top] = read_window;
  if (debugLevel >= 2) console.time("[geotiff-read-bbox] reading rasters");
  const data = await selected_image.readRasters({ window: [left, top, right, bottom] });
  if (debugLevel >= 2) console.timeEnd("[geotiff-read-bbox] reading rasters");
  if (debugLevel >= 3) console.log("[geotiff-read-bbox] data:", data);
  if (debugLevel >= 1) console.timeEnd("[geotiff-read-bbox]");
  return { data, srs_of_geotiff, read_bbox, height: data.height, width: data.width, read_window, selected_image_index };
};
