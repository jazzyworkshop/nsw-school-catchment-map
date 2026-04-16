const fs = require("fs");

const primary = JSON.parse(fs.readFileSync("primary.geojson"));
const secondary = JSON.parse(fs.readFileSync("secondary.geojson"));
const future = JSON.parse(fs.readFileSync("future.geojson"));

const merged = {
  type: "FeatureCollection",
  features: [...primary.features, ...secondary.features, ...future.features],
};

fs.writeFileSync("catchments.geojson", JSON.stringify(merged, null, 2));

console.log("Merged into catchments.geojson");
