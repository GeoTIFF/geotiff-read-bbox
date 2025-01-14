import getSRS from "geotiff-epsg-code";
import GT from "geotiff-geotransform";

import reproject from "bbox-fns/reproject.js";
import scale from "bbox-fns/scale.js";
import bboxIntersect from "bbox-fns/intersect.js";
import bboxSize from "bbox-fns/bbox-size.js";

import collect_proj4 from "proj4-collect";

import Geotransform from "geoaffine/Geotransform.js";

// convert ij bbox to read window used by geotiff.js
export function snap_to_read_window([xmin, ymin, xmax, ymax], padding) {
  const [padX, padY] = padding || [0, 0];
  return [Math.floor(xmin) - padX, Math.floor(ymin) - padY, Math.ceil(xmax) + padX, Math.ceil(ymax) + padY];
}

export default async function geotiff_read_bbox({
  bbox,
  clamp = false,
  debug_level = 0,
  density = 100,
  fill_value,
  geotiff,
  geotiff_srs,
  padding,
  proj4: custom_proj4,
  srs: srs_of_bbox,
  use_overview = false,
  target_height,
  target_width,
  signal
}) {
  if (debug_level >= 1) console.log("[geotiff-read-bbox] starting");

  if (signal && signal.aborted) throw new Error("[geotiff-read-bbox] operation aborted");
  if (geotiff === null) throw new Error("[geotiff-read-bbox] geotiff is null");
  if (geotiff === undefined) throw new Error("[geotiff-read-bbox] geotiff is undefined");

  const start_get_image = performance.now();
  const image = await geotiff.getImage();
  const duration_get_image = performance.now() - start_get_image;
  if (debug_level >= 2) {
    console.log(`[geotiff-read-bbox] getting first image took ${Math.round(duration_get_image)} ms`);
  }

  const image_height = image.getHeight();
  const image_width = image.getWidth();
  if (debug_level >= 2) console.log("[geotiff-read-bbox] image_height:", image_height);
  if (debug_level >= 2) console.log("[geotiff-read-bbox] image_width:", image_width);

  if (!geotiff_srs) geotiff_srs = await getSRS(geotiff);
  if (debug_level >= 2) console.log("[geotiff-read-bbox] geotiff_srs:", geotiff_srs);

  if ([undefined, null, 32767].includes(geotiff_srs) && srs_of_bbox !== "simple") {
    throw new Error("[geotiff-read-bbox] unable to parse SRS of geotiff");
  }
  // normalize srs information
  if (typeof geotiff_srs === "number") geotiff_srs = "EPSG:" + geotiff_srs;
  if (typeof srs_of_bbox === "number") srs_of_bbox = "EPSG:" + srs_of_bbox;

  const fd = image.fileDirectory;

  if (!(fd.ModelTransformation || (fd.ModelTiepoint && fd.ModelPixelScale))) {
    throw new Error("GeoTIFF doesn't have ModelTransformation nor ModelTiepoint+ModelPixelScale");
  }

  const geotransform = GT(image);
  if (debug_level >= 1) console.log("[geotiff-read-bbox] geotransform:", geotransform);
  const affine = Geotransform(geotransform);

  if (debug_level >= 1) console.log("[geotiff-read-bbox] affine:", affine);

  const proj4 = collect_proj4([custom_proj4]);
  if (debug_level >= 1) console.log("[geotiff-read-bbox] proj4:", typeof proj4);

  let bbox_in_base_image_coords;
  if (srs_of_bbox === "simple") {
    const [xmin, ymin, xmax, ymax] = bbox;

    bbox_in_base_image_coords = [
      xmin,
      image.getHeight() - ymax, // how many pixels from top of geotiff,
      xmax,
      image.getHeight() - ymin // how many pixels from top of geotiff
    ];
  } else {
    let convert_from_srs_of_bbox_to_px_of_geotiff;
    let convert_from_px_of_geotiff_to_srs_of_bbox;
    let convert_from_srs_of_geotiff_to_srs_of_bbox;
    let convert_from_srs_of_bbox_to_srs_of_geotiff;
    if (geotiff_srs === srs_of_bbox) {
      if (debug_level >= 2) console.log("[geotiff-read-bbox] srs of geotiff and bbox are the same!");
      convert_from_srs_of_geotiff_to_srs_of_bbox = pt => pt;
      convert_from_srs_of_bbox_to_srs_of_geotiff = pt => pt;
      convert_from_srs_of_bbox_to_px_of_geotiff = xy => affine.inverse(xy);
      convert_from_px_of_geotiff_to_srs_of_bbox = ij => affine.forward(ij);
    } else {
      // check if srs is in proj4 defs if not wkt nor proj4 string
      if (!geotiff_srs.includes("[") && !geotiff_srs.includes("+") && !proj4.defs[geotiff_srs]) throw new Error("[geotiff-read-bbox] unrecognized srs: " + geotiff_srs);
      if (!srs_of_bbox.includes("[") && !srs_of_bbox.includes("+") && !proj4.defs[srs_of_bbox]) throw new Error("[geotiff-read-bbox] unrecognized srs: " + srs_of_bbox);
      ({ forward: convert_from_srs_of_geotiff_to_srs_of_bbox, inverse: convert_from_srs_of_bbox_to_srs_of_geotiff } = proj4(geotiff_srs, srs_of_bbox));
      convert_from_srs_of_bbox_to_px_of_geotiff = xy => affine.inverse(convert_from_srs_of_bbox_to_srs_of_geotiff(xy));
      convert_from_px_of_geotiff_to_srs_of_bbox = ij => convert_from_srs_of_geotiff_to_srs_of_bbox(affine.forward(ij));
    }

    // convert bounding box in arbitrary spatial reference system to image coordinates in geotiff
    bbox_in_base_image_coords = reproject(bbox, convert_from_srs_of_bbox_to_px_of_geotiff, { density, nan_strategy: "skip" });
  }

  if (debug_level >= 2) console.log("[geotiff-read-bbox] bbox_in_base_image_coords:", bbox_in_base_image_coords);

  // read window as used by geotiff.js
  let read_window = snap_to_read_window(bbox_in_base_image_coords, padding);
  if (debug_level >= 2) console.log("[geotiff-read-bbox] read_window:", read_window);

  let [read_width, read_height] = bboxSize(read_window);
  if (debug_level >= 2) console.log("[geotiff-read-bbox] base read size:", [read_width, read_height]);

  const selected = {
    image,
    image_height,
    image_width,
    index: 0,
    ratio: [1, 1],
    read_window,
    read_height,
    read_width
  };
  if (use_overview && target_height && target_width) {
    // figure out ratio between actual raw width and desired width
    if (debug_level >= 2) console.log("[geotiff-read-bbox] getting image count");
    const start_get_image_count = performance.now();
    const image_count = await geotiff.getImageCount();
    if (debug_level >= 2) console.log("[geotiff-read-bbox] image_count: " + image_count);
    const duration_get_image_count = performance.now() - start_get_image_count;
    if (debug_level >= 2) {
      console.log(`[geotiff-read-bbox] getting image count (${image_count}) took ${duration_get_image_count} ms`);
    }

    for (let i = 1; i < image_count; i++) {
      const subimage = await geotiff.getImage(i);
      if (debug_level >= 3) console.log("[geotiff-read-bbox] subimage:", typeof subimage);

      if (subimage.fileDirectory.PhotometricInterpretation === 4) {
        if (debug_level >= 3) console.log(`[geotiff-read-bbox] ignoring image ${i} because it is a transparency mask`);
        continue;
      }

      // from 0 to 1
      const ratioX = subimage.getHeight() / image_height;
      if (debug_level >= 3) console.log("[geotiff-read-bbox] ratioX:", ratioX);

      const ratioY = subimage.getWidth() / image_width;
      if (debug_level >= 3) console.log("[geotiff-read-bbox] ratioY:", ratioY);

      const bbox_in_subimage_coords = scale(bbox_in_base_image_coords, [ratioX, ratioY]);
      if (debug_level >= 3) console.log("[geotiff-read-bbox] bbox_in_subimage_coords:", bbox_in_subimage_coords);

      const subimage_read_window = snap_to_read_window(bbox_in_subimage_coords, padding);
      if (debug_level >= 2) console.log("[geotiff-read-bbox] subimage_read_window:", subimage_read_window);

      // how many pixels we would clip from the current image
      [read_width, read_height] = bboxSize(subimage_read_window);
      if (debug_level >= 3) console.log("[geotiff-read-bbox] read_width:", read_width);
      if (debug_level >= 3) console.log("[geotiff-read-bbox] read_height:", read_height);

      if (read_height >= target_height && read_width >= target_width) {
        selected.image = subimage;
        selected.image_height = subimage.getHeight();
        selected.image_width = subimage.getWidth();
        selected.index = i;
        selected.ratio = [ratioX, ratioY];
        selected.read_height = read_height;
        selected.read_width = read_width;
        selected.read_window = subimage_read_window;
        if (debug_level >= 2) console.log("[geotiff-read-bbox] selected:", selected);
      } else {
        break;
      }
    }
  }

  const start_read_rasters = performance.now();

  let data;

  if (debug_level >= 3) console.log("[geotiff-read-bbox] selected:", selected);
  const [left, top, right, bottom] = selected.read_window;

  if (right <= 0 || bottom <= 0 || left >= selected.image_width || top >= selected.image_height) {
    // totally outside raster, so skip geotiff.js
    const depth = image.getSamplesPerPixel();
    const read_area = selected.read_width * selected.read_height;
    data = [];
    for (let b = 0; b < depth; b++) data.push(new Array(read_area).fill(fill_value));
  } else {
    if (clamp) {
      if (debug_level >= 2) console.log("[geotiff-read-bbox] clamping");
      selected.read_window = bboxIntersect(selected.read_window, [0, 0, selected.image_width, selected.image_height]);
      [read_width, read_height] = bboxSize(selected.read_window);
      selected.read_height = read_height;
      selected.read_width = read_width;
    }
    if (debug_level >= 2) console.log("[geotiff-read-bbox] reading ", selected.read_window);
    data = await selected.image.readRasters({ fillValue: fill_value, window: selected.read_window, signal });
  }

  const duration_read_rasters = performance.now() - start_read_rasters;
  if (debug_level >= 2) {
    console.log("[geotiff-read-bbox] reading rasters took " + duration_read_rasters.toFixed() + "ms");
  }
  if (debug_level >= 3) console.log("[geotiff-read-bbox] data:", data);

  const unscaled_read_window = scale(
    selected.read_window,
    selected.ratio.map(n => 1 / n)
  );

  const read_bbox = reproject(unscaled_read_window, affine.forward, { density });

  // create geotransform equation for current data
  const [scaled_left, scaled_top, scaled_right, scaled_bottom] = unscaled_read_window;
  const upper_left = [scaled_left, scaled_top];
  if (debug_level >= 3) console.log("[geotiff-read-bbox] upper_left:", upper_left);
  const [upper_left_x, upper_left_y] = affine.forward(upper_left);

  const read_geotransform = [
    upper_left_x,
    geotransform[1] / selected.ratio[0],
    geotransform[2] / selected.ratio[1],
    upper_left_y,
    geotransform[4] / selected.ratio[0],
    geotransform[5] / selected.ratio[1]
  ];

  const simple_bbox = [unscaled_read_window[0], image_height - unscaled_read_window[3], unscaled_read_window[2], image_height - unscaled_read_window[1]];

  const result = {
    base_window: unscaled_read_window,
    bbox: read_bbox,
    data,
    geotransform: read_geotransform,
    height: selected.read_height,
    index: selected.index,
    image: selected.image,
    simple_bbox,
    srs: geotiff_srs,
    width: selected.read_width,
    window: selected.read_window
  };

  [
    ["read_bbox", "bbox"],
    ["selected_image_index", "index"],
    ["selected_image", "image"]
  ].forEach(([_from, _to]) => {
    Object.defineProperty(result, _from, {
      get() {
        if (debug_level >= 1) console.log(`[geotiff-read-bbox] ${_from} is deprected, please use ${_to} instead`);
        return result[_to];
      }
    });
  });

  Object.defineProperty(result, "read_window", {
    get() {
      if (debug_level >= 1) {
        console.log("[geotiff-read-bbox] read_window [left, bottom, top, right] is deprected, please use window [left, top, right, bottom] instead");
      }
      return [this.window[0], this.window[3], this.window[2], this.window[1]];
    }
  });

  Object.defineProperty(result, "srs_of_geotiff", {
    get() {
      if (debug_level >= 1) console.log("[geotiff-read-bbox] srs_of_geotiff is deprected, please use srs instead");
      return this.srs.startsWith("EPSG:") ? Number(this.srs.replace("EPSG:", "")) : this.srs;
    }
  });

  return result;
}
