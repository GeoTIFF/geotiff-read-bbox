# geotiff-read-bbox
Read Pixel Values from a GeoTIFF within a Bounding Box in almost any Projection

# motivation
Sometimes you want to display pixel values in a different projection
than your GeoTIFF.  The most common use case is when you want to create an image
for a web map tile in Web Mercator, but your GeoTIFF is not in Web Mercator.

# install
```bash
npm install geotiff-read-bbox
```

# usage
```javascript
const geotiff = require("geotiff");
const readBoundingBox = require("geotiff-read-bbox");

const url = "https://s3-us-west-2.amazonaws.com/planet-disaster-data/hurricane-harvey/SkySat_Freeport_s03_20170831T162740Z3.tif";
const geotiff = await GeoTIFF.fromUrl(url);

const result = await readBoundingBox({
  // bounding box in [xmin, ymin, xmax, ymax] format
  bbox: [-95.33935546875, 28.92163128242129, -95.3173828125, 28.940861769405547],

  // set debugLevel to zero for no logging, and higher for more logging
  debugLevel: 1,

  // spatial reference system of the bounding box
  srs: 4326,

  // tiff object created by using the geotiff.js library
  geotiff,

  // default to false
  // whether it's okay to use a lower-resolution overview image
  use_overview: true,

  // use with use_overview
  // sets the desired size of the clipped pixels
  // useful if you are trying to generate an image
  // at a resolution lower than that of the highest-resolution image 
  target_height: 256,
  target_width: 256
});
```
result will look like the following
```javascript
{
  srs_of_geotiff: 32615,

  // bounding box of read result
  read_bbox: [ 271940.8, 3201512.8000000003, 274126.4, 3203687.2 ],

  // actual bbox of pixels read from the GeoTIFF
  // in [left, top, right, bottom]
  // with top left corner as origin [0, 0]
  read_window: [1938, 2517, 2280, 2177],

  // index of tiff image used
  // zero is raw/highest-resolution value
  // 1 and higher are overviews
  // with the highest being the lowest resolution 
  selected_image_index: 4,

  // height of read result in pixels
  height: 2718,

  // width of read result in pixels
  width: 2732,

  data: [
    Uint8Array(7425576) [
      140, 141, 141, 141, 140, 139, 139, 140, 139, 139, 140, 140,
      140, 140, 141, 141, 143, 143, 142, 142, 142, 142, 142, 143,
      ... many more items
    ],
    Uint8Array(7425576) [
      136, 136, 136, 136, 136, 135, 136, 137, 135, 135, 135, 136,
      135, 136, 137, 137, 139, 139, 138, 138, 137, 137, 137, 138,
      ... many more items
    ],
    Uint8Array(7425576) [
      130, 131, 133, 133, 133, 132, 132, 133, 132, 132, 133, 134,
      133, 133, 134, 134, 136, 136, 135, 135, 135, 135, 134, 135,
      ... many more items
    ],
    width: 2732,
    height: 2718
  ]
}
```