// Drawn polygons features 
var patches = ee.FeatureCollection([
  ee.Feature(airport, {patch: 'Urban'}),
  ee.Feature(tu_ground, {patch: 'Peri-urban'}),
  ee.Feature(chovar, {patch: 'Rural'})
]);


// Visualize
Map.centerObject(patches, 13);
Map.addLayer(patches.style({color: 'red', fillColor: '00000000'}), {}, 'Your Patches');

// === Load Datasets (2000-2022, monsoon JJASO only) ===
var startYear = 2000;
var endYear = 2022;

// LST: MODIS Daytime (scaled to °C)
var lstCol = ee.ImageCollection('MODIS/006/MOD11A2')
  .filterDate(ee.Date.fromYMD(startYear,1,1), ee.Date.fromYMD(endYear+1,1,1))
  .select('LST_Day_1km')
  .map(function(img) {
    return img.multiply(0.02).subtract(273.15)
      .copyProperties(img, ['system:time_start']);
  })
  .filter(ee.Filter.calendarRange(6,10,'month'));

// NDVI: MODIS Monthly
var ndviCol = ee.ImageCollection('MODIS/006/MOD13A3')
  .filterDate(ee.Date.fromYMD(startYear,1,1), ee.Date.fromYMD(endYear+1,1,1))
  .select('NDVI')
  .map(function(img) {
    return img.multiply(0.0001)
      .copyProperties(img, ['system:time_start']);
  })
  .filter(ee.Filter.calendarRange(6,10,'month'));

// Soil Moisture: ERA5-Land (correct band name)
var smCol = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY')
  .filterDate(ee.Date.fromYMD(startYear,1,1), ee.Date.fromYMD(endYear+1,1,1))
  .select('volumetric_soil_water_layer_1')
  .filter(ee.Filter.calendarRange(6,10,'month'));

// ET₀: TerraClimate PET
var et0Col = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate(ee.Date.fromYMD(startYear,1,1), ee.Date.fromYMD(endYear+1,1,1))
  .select('pet')
  .filter(ee.Filter.calendarRange(6,10,'month'));

// === Compute Yearly Monsoon (JJASO) Means ===
var computeYearlyMeans = function(collection, bandName) {
  var years = ee.List.sequence(startYear, endYear);
  return ee.ImageCollection.fromImages(
    years.map(function(y) {
      var yearStart = ee.Date.fromYMD(y, 6, 1);
      var yearEnd = yearStart.advance(5, 'month');  // June to October
      var yearlyMean = collection.filterDate(yearStart, yearEnd).mean();
      return yearlyMean
        .rename(bandName)
        .set('year', y)
        .set('system:time_start', yearStart.millis());
    })
  );
};

var yearlyLst = computeYearlyMeans(lstCol, 'LST_Day');
var yearlyNdvi = computeYearlyMeans(ndviCol, 'NDVI');
var yearlySm = computeYearlyMeans(smCol, 'soil_moisture');
var yearlyEt0 = computeYearlyMeans(et0Col, 'pet');

// === Extract Means for Each Patch ===
var extractMeans = function(yearlyCol, bandName) {
  return yearlyCol.map(function(img) {
    var stats = img.reduceRegions({
      collection: patches,
      reducer: ee.Reducer.mean(),
      scale: 1000,
      tileScale: 4  // Key fix: replaces maxPixels, prevents memory timeouts
    });
    return stats.map(function(f) {
      return f.set('year', img.get('year'));
    });
  }).flatten()
  .select(['patch', 'year', 'mean'], ['patch', 'year', bandName + '_mean']);
};

var lstTable = extractMeans(yearlyLst, 'LST');
var ndviTable = extractMeans(yearlyNdvi, 'NDVI');
var smTable = extractMeans(yearlySm, 'soil_moisture');
var et0Table = extractMeans(yearlyEt0, 'ET0');

// Quick check in console
print('Sample LST Means:', lstTable.limit(15));
print('Sample NDVI Means:', ndviTable.limit(15));

// === Export to Google Drive ===
Export.table.toDrive({
  collection: lstTable,
  description: 'Monsoon_JJASO_Mean_LST_2000_2022',
  folder: 'GEE_Exports',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: ndviTable,
  description: 'Monsoon_JJASO_Mean_NDVI_2000_2022',
  folder: 'GEE_Exports',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: smTable,
  description: 'Monsoon_JJASO_Mean_SoilMoisture_ERA5_2000_2022',
  folder: 'GEE_Exports',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: et0Table,
  description: 'Monsoon_JJASO_Mean_ET0_PET_2000_2022',
  folder: 'GEE_Exports',
  fileFormat: 'CSV'
});

print('Exports queued — go to Tasks tab and click Run for each!');
