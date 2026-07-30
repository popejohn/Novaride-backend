/**
 * Location Controller
 *
 * Thin HTTP layer. All Google Maps logic lives in googleMapsService.
 * Routes are unchanged so the frontend requires no URL updates.
 */

const googleMapsService = require('../Services/googleMapsService');

// ─────────────────────────────────────────────────────────
// GET /location/autocomplete?q=&limit=
// Used by: frontend autocomplete dropdown (pickup + destination)
// ─────────────────────────────────────────────────────────
const autocomplete = async (req, res, next) => {
  const { q, limit } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ success: false, message: 'Query string (q) is required' });
  }

  try {
    const results = await googleMapsService.searchPlaces(q, parseInt(limit, 10) || 5);
    return res.status(200).json(results);
  } catch (error) {
    console.error('[LocationController] autocomplete error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: 'Failed to fetch suggestions from location service',
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────
// GET /location/reverse?lat=&lon=
// Used by: "Use My Location" button (reverse geocodes GPS coords)
// ─────────────────────────────────────────────────────────
const reverse = async (req, res, next) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ success: false, message: 'Latitude (lat) and Longitude (lon) are required' });
  }

  try {
    const result = await googleMapsService.reverseGeocode(lat, lon);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[LocationController] reverse geocode error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: 'Failed to reverse geocode from location service',
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────
// GET /location/search?q=
// Used by: handleFare() — geocodes typed address to lat/lng
// ─────────────────────────────────────────────────────────
const search = async (req, res, next) => {
  const { q } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ success: false, message: 'Query string (q) is required' });
  }

  try {
    const results = await googleMapsService.geocodeAddress(q);
    return res.status(200).json(results);
  } catch (error) {
    console.error('[LocationController] search/geocode error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: 'Failed to geocode address from location service',
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────
// GET /location/directions/driving/:coordinates
// Used by: calculateDistanceAndETA() in reverseGeo.js
// Coordinates format: "originLng,originLat;destLng,destLat"
// ─────────────────────────────────────────────────────────
const directions = async (req, res, next) => {
  const { coordinates } = req.params;

  if (!coordinates) {
    return res.status(400).json({ success: false, message: 'Coordinates parameter is required' });
  }

  try {
    const result = await googleMapsService.getDistanceAndDuration(coordinates);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[LocationController] directions error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: 'Failed to calculate directions from location service',
      error: error.message,
    });
  }
};

module.exports = {
  autocomplete,
  reverse,
  search,
  directions,
};
