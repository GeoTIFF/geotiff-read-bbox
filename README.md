# geotiff-read-bbox
Read Pixel Values from a GeoTIFF within a Bounding Box in almost any Projection

## motivation
Sometimes you want to display pixel values in a different projection
than your GeoTIFF.  The most common use case is when you want to create an image
for a web map tile in Web Mercator, but your GeoTIFF is not in Web Mercator.

## install
```bash
npm install geotiff-read-bbox
```

## basic usage
```javascript
const geotiff = require("geotiff");
const readBoundingBox = require("geotiff-read-bbox");

const url = "https://maxar-ard-samples.s3.amazonaws.com/v3/australia_vineyards/50/213133231011/2019-10-07/10500100191CD200-visual.tif";
const geotiff = await GeoTIFF.fromUrl(url);

const result = await readBoundingBox({
  // bounding box in format [xmin, ymin, xmax, ymax]
  // bbox for tile: https://a.tile.openstreetmap.org/11/1678/1229.png
  bbox: [114.9609375, -34.016241889667015, 115.13671875, -33.87041555094183],

  // set debugLevel to zero for no logging, and higher for more logging
  debugLevel: 0,

  // how many points to add to each side of the bounding box if reprojecting
  // optional, default is 100
  density: 100,

  // tiff object created by using the geotiff.js library
  geotiff,

  // optional
  // override srs of the source data
  // useful if we can't parse srs from geotiff metdata
  geotiff_srs: 32759,

  // spatial reference system of the bounding box
  srs: 4326,

  // default to false
  // whether it's okay to use a lower-resolution overview image
  use_overview: true,

  // use with use_overview
  // sets the desired size of the clipped pixels
  // useful if you are trying to generate an image
  // at a resolution lower than that of the highest-resolution image 
  target_height: 512,
  target_width: 512
});
```
result will look like the following
```javascript
{
  // bounding box of the read result
  bbox: [ 311386.71875, 6234160.15625, 327968.75, 6250664.0625 ],

  // clipped data (without warping)
  data: [
    Uint8Array(717405) [
      140, 141, 141, 141, 140, 139, 139, 140, 139, 139, 140, 140,
      140, 140, 141, 141, 143, 143, 142, 142, 142, 142, 142, 143,
      ... many more items
    ],
    Uint8Array(717405) [
      136, 136, 136, 136, 136, 135, 136, 137, 135, 135, 135, 136,
      135, 136, 137, 137, 139, 139, 138, 138, 137, 137, 137, 138,
      ... many more items
    ],
    Uint8Array(717405) [
      130, 131, 133, 133, 133, 132, 132, 133, 132, 132, 133, 134,
      133, 133, 134, 134, 136, 136, 135, 135, 135, 135, 134, 135,
      ... many more items
    ],
    width: 849,
    height: 845
  ],

  // 6-parameter geotransform for the read data
  // https://gdal.org/tutorials/geotransforms_tut.html
  geotransform: [ 311386.71875, 19.53125, 0, 6250664.0625, 0, -19.53125 ],

  // height of result data in pixels
  height: 845,

  // instance of geotiff.js image
  image: GeoTIFFImage,

  // index of tiff image used
  // zero is raw/highest-resolution value
  // 1 and higher are overviews
  // with the highest being the lowest resolution
  index: 7,

  // srs of the read data (same as geotiff)
  srs: "EPSG:32750",

  // width of result data in pixels
  width: 849,

  // actual bbox of pixels read from the GeoTIFF
  // in [left, top, right, bottom]
  // with top left corner as origin [0, 0]
  window: [ -177, -538, 672, 307 ]
}
```

## advanced usage
### image coordinates
You can request request specific pixels by using the "simple" spatial reference system, which is really no spatial reference system at all.  Technically, it's a non-spatial coordinate reference system where
the bottom-left of the geotiff is [0, 0] and the top-right is [width, height].  This is inspired by Leaflet's [Simple CRS](https://leafletjs.com/examples/crs-simple/crs-simple.html).
```js
const result = await readBoundingBox({
  bbox: [128, 656, 144, 672],
  srs: "simple"
});
```

