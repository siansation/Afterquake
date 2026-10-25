// Bound drawing work, not the underlying forecast grids. A selected place always
// uses the full-resolution data; these sizes apply only to the map overview.
const MAP_RENDER = (() => {
  function fit(width, height, maxSide = 128, maxPixels = 16384) {
    if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw new RangeError('Invalid map dimensions.');
    const scale = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
    return { cols: Math.max(1, Math.floor(width * scale)), rows: Math.max(1, Math.floor(height * scale)) };
  }
  function heatSize(grid) {
    const cols = Math.min(96, grid.nc);
    const rows = Math.max(1, Math.round(cols * (grid.lat0 - grid.lat1) / ((grid.lon1 - grid.lon0) * grid.c)));
    return fit(cols, rows, 96, 6400);
  }
  function sampleIndex(index, cols, rows, sourceCols, sourceRows) {
    const x = Math.min(sourceCols - 1, Math.floor((index % cols + .5) * sourceCols / cols));
    const y = Math.min(sourceRows - 1, Math.floor((Math.floor(index / cols) + .5) * sourceRows / rows));
    return y * sourceCols + x;
  }
  function globeRatio(width, height, ratio = 1) {
    return Math.min(Math.max(1, ratio || 1), 1.5, Math.sqrt(2000000 / (Math.max(1, width) * Math.max(1, height))));
  }
  return { fit, heatSize, sampleIndex, globeRatio };
})();
if (typeof module !== 'undefined') module.exports = MAP_RENDER;
