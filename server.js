const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

let cache = null;
let cacheTime = 0;

app.use(express.static('.'));

app.get('/api/rate', async (req, res) => {
  try {
    if (cache && (Date.now() - cacheTime < 5000)) {
      return res.json(cache);
    }

    const response = await axios.get('https://sp-today.com/currency/us-dollar', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(response.data);

    // عدّل المحددات التالية إذا تغيرت بنية الموقع المصدر
    let buy = null;
    let sell = null;

    const pageText = $.text();
    const nums = pageText.match(/\d[\d,]*/g);

    if (nums && nums.length >= 2) {
      buy = parseInt(nums[0].replace(/,/g, ''));
      sell = parseInt(nums[1].replace(/,/g, ''));
    }

    const result = {
      success: true,
      buy,
      sell,
      updatedAt: new Date().toISOString(),
      change: 0
    };

    cache = result;
    cacheTime = Date.now();

    res.json(result);
  } catch (err) {
    if (cache) return res.json(cache);
    res.json({ success: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
