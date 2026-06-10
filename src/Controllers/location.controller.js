const axios = require('axios');
const env = require('../Configs/env');

const autocomplete = async (req, res, next) => {
  const { q, limit, viewbox } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ success: false, message: 'Query string (q) is required' });
  }

  try {
    const response = await axios.get('https://us1.locationiq.com/v1/autocomplete', {
      params: {
        key: env.LOCATIONIQ_API_KEY,
        q,
        limit: limit || 5,
        dedupe: 1,
        normalizeaddress: 1,
        viewbox: viewbox || '3.975,7.458,3.833,7.325', // default: Ibadan
        bounded: 1,
        countrycodes: 'ng', // Nigeria
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('LocationIQ Autocomplete proxy error:', error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch suggestions from Location service',
      error: error.response?.data || error.message,
    });
  }
};

const reverse = async (req, res, next) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ success: false, message: 'Latitude (lat) and Longitude (lon) are required' });
  }

  try {
    const response = await axios.get('https://us1.locationiq.com/v1/reverse.php', {
      params: {
        key: env.LOCATIONIQ_API_KEY,
        lat,
        lon,
        format: 'json',
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('LocationIQ Reverse Geocoding proxy error:', error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to reverse geocode from Location service',
      error: error.response?.data || error.message,
    });
  }
};

const search = async (req, res, next) => {
  const { q } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ success: false, message: 'Query string (q) is required' });
  }

  try {
    const response = await axios.get('https://us1.locationiq.com/v1/search.php', {
      params: {
        key: env.LOCATIONIQ_API_KEY,
        q,
        format: 'json',
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('LocationIQ Forward Geocoding proxy error:', error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to geocode address from Location service',
      error: error.response?.data || error.message,
    });
  }
};

const directions = async (req, res, next) => {
  const { coordinates } = req.params;

  if (!coordinates) {
    return res.status(400).json({ success: false, message: 'Coordinates parameter is required' });
  }

  try {
    const response = await axios.get(`https://us1.locationiq.com/v1/directions/driving/${coordinates}`, {
      params: {
        key: env.LOCATIONIQ_API_KEY,
        geometries: 'geojson',
        overview: 'simplified',
        alternatives: false,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('LocationIQ Directions proxy error:', error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to calculate directions from Location service',
      error: error.response?.data || error.message,
    });
  }
};

module.exports = {
  autocomplete,
  reverse,
  search,
  directions,
};
