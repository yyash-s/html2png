const API_KEY = process.env.Y_API;

//app.use((req, res, next) => {
  //if (!API_KEY) return next();
  //const key = req.get('x-api-key');
  //if (key !== API_KEY) return res.status(401).send('Unauthorized');
  //next();
//});


const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
app.use(bodyParser.text({ type: ['text/html','application/xhtml+xml','text/plain'], limit: '10mb' }));

app.post('/render', async (req, res) => {
  const html = req.body || '<html><body><h1>No HTML provided</h1></body></html>';
  const width = parseInt(req.query.width) || 1200;
  const height = parseInt(req.query.height) || 800;
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox','--disable-setuid-sandbox'],
      defaultViewport: { width, height },
      headless: true
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.screenshot({ type: 'png', fullPage: true });
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('Render error', err);
    res.status(500).send('Rendering failed');
  } finally {
    if (browser) await browser.close();
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`html2png listening on ${port}`));
