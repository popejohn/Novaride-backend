/**
 * Google Maps Service
 *
 * Centralizes all Google Maps Platform API calls for the Novaride backend.
 * Controllers must NOT call Google APIs directly — use this service instead.
 *
 * APIs used:
 *  - Places API (New)  — autocomplete   [places.googleapis.com]
 *  - Geocoding API     — forward + reverse geocoding  [maps.googleapis.com]
 *  - Routes API        — distance and duration  [routes.googleapis.com]
 *    └─ Falls back to Haversine + speed estimate if Routes API is not enabled
 */

const axios = require('axios');
const env = require('../Configs/env');

const GEOCODING_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_NEW_AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const ROUTES_API = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// ─────────────────────────────────────────────
// Helper: build a consistent service error
// ─────────────────────────────────────────────
const buildError = (message, status = 500, raw = null) => {
  const err = new Error(message);
  err.status = status;
  err.raw = raw;
  return err;
};

// ─────────────────────────────────────────────
// Helper: Haversine distance (metres) between two lat/lng points
// ─────────────────────────────────────────────
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Helper: resolve lat/lon for a placeId or address string
const getPlaceLocation = async (placeId, address) => {
  if (placeId) {
    try {
      const response = await axios.get(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'location',
        },
        timeout: 3000,
      });
      if (response.data?.location) {
        return {
          lat: String(response.data.location.latitude),
          lon: String(response.data.location.longitude),
        };
      }
    } catch (err) {
      console.warn(`[GoogleMaps] Failed to fetch place details for ${placeId}:`, err.message);
    }
  }

  if (address) {
    try {
      const response = await axios.get(GEOCODING_BASE, {
        params: {
          address,
          key: env.GOOGLE_MAPS_API_KEY,
          region: 'ng',
          language: 'en',
        },
        timeout: 3000,
      });
      if (response.data?.status === 'OK' && response.data.results?.[0]?.geometry?.location) {
        const loc = response.data.results[0].geometry.location;
        return {
          lat: String(loc.lat),
          lon: String(loc.lng),
        };
      }
    } catch (err) {
      console.warn(`[GoogleMaps] Failed geocoding fallback for "${address}":`, err.message);
    }
  }

  return { lat: null, lon: null };
};

// ─────────────────────────────────────────────
// 1. Place Autocomplete  (Places API New)
//    POST https://places.googleapis.com/v1/places:autocomplete
//    Returns: [{ display_name, lat, lon, placeId }]
//    Field names mirror the old LocationIQ shape so the frontend
//    requires zero changes.
// ─────────────────────────────────────────────
const searchPlaces = async (input, limit = 5) => {
  if (!input || input.trim() === '') return [];

  console.info(`[GoogleMaps] searchPlaces: "${input}"`);

  try {
    const response = await axios.post(
      PLACES_NEW_AUTOCOMPLETE,
      {
        input,
        includedRegionCodes: ['ng'], // restrict to Nigeria
        languageCode: 'en',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          // Request only the fields we need — reduces billing cost
          'X-Goog-FieldMask':
            'suggestions.placePrediction.text,suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
        },
      }
    );

    const suggestions = response.data.suggestions || [];

    // Normalize to the same shape the frontend already expects with resolved lat/lon
    const results = await Promise.all(
      suggestions.slice(0, limit).map(async (s) => {
        const p = s.placePrediction;
        const displayName = p.text?.text || p.structuredFormat?.mainText?.text || '';
        const loc = await getPlaceLocation(p.placeId, displayName);

        return {
          display_name: displayName,
          lat: loc.lat,
          lon: loc.lon,
          placeId: p.placeId,
        };
      })
    );

    console.info(`[GoogleMaps] searchPlaces: returned ${results.length} results with resolved coordinates`);
    return results;
  } catch (error) {
    if (error.status) throw error;
    const googleStatus = error.response?.data?.error?.status || error.response?.data?.status;
    console.error('[GoogleMaps] searchPlaces error:', googleStatus || error.message);
    throw buildError(
      'Google Places autocomplete request failed',
      error.response?.status || 500,
      error.response?.data || error.message
    );
  }
};

// ─────────────────────────────────────────────
// 2. Forward Geocoding (address → lat/lng)
//    Returns: [{ lat, lon, display_name }]
//    Array shape mirrors LocationIQ /search.php
// ─────────────────────────────────────────────
const geocodeAddress = async (address) => {
  if (!address || address.trim() === '') return [];

  console.info(`[GoogleMaps] geocodeAddress: "${address}"`);

  try {
    const response = await axios.get(GEOCODING_BASE, {
      params: {
        address,
        key: env.GOOGLE_MAPS_API_KEY,
        region: 'ng',   // bias results toward Nigeria
        language: 'en',
      },
    });

    const { status, results } = response.data;

    if (status === 'ZERO_RESULTS') {
      console.info('[GoogleMaps] geocodeAddress: no results');
      return [];
    }

    if (status !== 'OK') {
      console.error(`[GoogleMaps] Geocoding API error: ${status}`);
      throw buildError(`Geocoding API returned status: ${status}`, 502, response.data);
    }

    // Normalize to LocationIQ-compatible array shape
    const normalized = results.map((r) => ({
      lat: String(r.geometry.location.lat),
      lon: String(r.geometry.location.lng),
      display_name: r.formatted_address,
    }));

    console.info(`[GoogleMaps] geocodeAddress: returned ${normalized.length} results`);
    return normalized;
  } catch (error) {
    if (error.status) throw error;
    console.error('[GoogleMaps] geocodeAddress HTTP error:', error.message);
    throw buildError('Google Geocoding request failed', error.response?.status || 500, error.message);
  }
};

// ─────────────────────────────────────────────
// 3. Reverse Geocoding (lat/lng → address)
//    Returns: { display_name }
//    Shape mirrors LocationIQ /reverse.php
// ─────────────────────────────────────────────
const reverseGeocode = async (lat, lng) => {
  console.info(`[GoogleMaps] reverseGeocode: (${lat}, ${lng})`);

  try {
    const response = await axios.get(GEOCODING_BASE, {
      params: {
        latlng: `${lat},${lng}`,
        key: env.GOOGLE_MAPS_API_KEY,
        language: 'en',
        result_type: 'street_address|route|neighborhood|locality',
      },
    });

    const { status, results } = response.data;

    if (status === 'ZERO_RESULTS') {
      console.info('[GoogleMaps] reverseGeocode: no results');
      return { display_name: null };
    }

    if (status !== 'OK') {
      console.error(`[GoogleMaps] Reverse Geocoding API error: ${status}`);
      throw buildError(`Reverse Geocoding API returned status: ${status}`, 502, response.data);
    }

    const best = results[0];
    const display_name = best ? best.formatted_address : null;

    console.info(`[GoogleMaps] reverseGeocode: "${display_name}"`);
    return { display_name };
  } catch (error) {
    if (error.status) throw error;
    console.error('[GoogleMaps] reverseGeocode HTTP error:', error.message);
    throw buildError('Google Reverse Geocoding request failed', error.response?.status || 500, error.message);
  }
};

// ─────────────────────────────────────────────
// 4. Distance + Duration
//    Primary:  Google Routes API (routes.googleapis.com)
//    Fallback: Haversine formula + speed estimate (works with no extra API enabled)
//
//    Accepts OSRM-style coordinate string: "originLng,originLat;destLng,destLat"
//    Returns: { routes: [{ distance, duration }] }
//    Shape mirrors LocationIQ /directions/driving so reverseGeo.js needs no changes.
// ─────────────────────────────────────────────
const getDistanceAndDuration = async (coordinatesParam) => {
  // Parse OSRM-style string: "originLng,originLat;destLng,destLat"
  const parts = coordinatesParam.split(';');
  if (parts.length !== 2) {
    throw buildError('Coordinates must be in format "originLng,originLat;destLng,destLat"', 400);
  }

  const [originLng, originLat] = parts[0].split(',').map(Number);
  const [destLng, destLat] = parts[1].split(',').map(Number);

  if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
    throw buildError('Invalid coordinate format', 400);
  }

  console.info(`[GoogleMaps] getDistanceAndDuration: (${originLat},${originLng}) → (${destLat},${destLng})`);

  // ── Primary: Routes API ─────────────────────────────────────────────────
  try {
    const routesResponse = await axios.post(
      ROUTES_API,
      {
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
        },
        timeout: 10000,
      }
    );

    const route = routesResponse.data?.routes?.[0];
    if (route && route.distanceMeters !== undefined) {
      const distanceMeters = route.distanceMeters;
      // duration is a string like "1234s" from Routes API
      const durationSeconds = parseInt(route.duration?.replace('s', ''), 10) || 0;

      const normalized = {
        routes: [
          {
            distance: distanceMeters,
            duration: durationSeconds,
            distance_text: `${(distanceMeters / 1000).toFixed(1)} km`,
            duration_text: `${Math.round(durationSeconds / 60)} mins`,
          },
        ],
      };

      console.info(
        `[GoogleMaps] getDistanceAndDuration (Routes API): ${normalized.routes[0].distance_text} / ${normalized.routes[0].duration_text}`
      );
      return normalized;
    }

    throw new Error('Routes API returned no route data');
  } catch (routesError) {
    const isApiNotEnabled =
      routesError.response?.data?.error?.status === 'PERMISSION_DENIED' ||
      routesError.response?.status === 403;

    if (isApiNotEnabled) {
      console.warn('[GoogleMaps] Routes API not enabled — falling back to Haversine calculation');
    } else {
      console.warn('[GoogleMaps] Routes API call failed, falling back to Haversine:', routesError.message);
    }

    // ── Fallback: Haversine + realistic urban speed estimate ─────────────
    // Average urban driving speed in Nigeria: ~30 km/h (accounting for traffic)
    const AVERAGE_SPEED_MS = 30 / 3.6; // 30 km/h in metres/second

    const distanceMeters = Math.round(haversineDistance(originLat, originLng, destLat, destLng));
    // Add 30% to straight-line distance for road routing factor
    const roadDistanceMeters = Math.round(distanceMeters * 1.3);
    const durationSeconds = Math.round(roadDistanceMeters / AVERAGE_SPEED_MS);

    const normalized = {
      routes: [
        {
          distance: roadDistanceMeters,
          duration: durationSeconds,
          distance_text: `${(roadDistanceMeters / 1000).toFixed(1)} km`,
          duration_text: `${Math.round(durationSeconds / 60)} mins`,
        },
      ],
    };

    console.info(
      `[GoogleMaps] getDistanceAndDuration (Haversine fallback): ${normalized.routes[0].distance_text} / ${normalized.routes[0].duration_text}`
    );
    return normalized;
  }
};

module.exports = {
  searchPlaces,
  geocodeAddress,
  reverseGeocode,
  getDistanceAndDuration,
};
