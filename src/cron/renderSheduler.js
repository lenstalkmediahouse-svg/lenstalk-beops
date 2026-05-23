const cron = require('node-cron');
const axios = require('axios');

const API_URL = 'https://lenstalk-ops-be-1.onrender.com/api/health';

cron.schedule('*/4 * * * *', () => {
  axios.get(API_URL).catch((err) => {
    // Optionally log error
    // console.error('Health check failed:', err.message);
  });
});
