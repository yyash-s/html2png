const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, ContainerSASPermissions } = require('@azure/storage-blob');

const app = express();
app.use(bodyParser.text({ type: ['text/html','application/xhtml+xml','text/plain'], limit: '10mb' }));

// API key middleware (adjust variable name if needed)
const API_KEY = process.env.Y_API;
app.use((req, res, next) => {
  if (!API_KEY) return next();
  const key = req.get('x-api-key');
  if (key !== API_KEY) return res.status(401).send('Unauthorized');
  next();
});

// Blob helpers
const AZ_CONN = process.env.Y_BLOB_CONN;      // Storage connection string
const AZ_CONTAINER = process.env.Y_BLOB_CONTAINER || 'renders';

async function uploadBufferAndGetSas(buffer, filename) {
  if (!AZ_CONN) throw new Error('Y_BLOB_CONN not configured');

  const blobServiceClient = BlobServiceClient.fromConnectionString(AZ_CONN);
  const containerClient = blobServiceClient.getContainerClient(AZ_CONTAINER);
  await containerClient.createIfNotExists({ access: 'private' });

  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: 'image/png' } });

  // Generate SAS (using account key extracted from connection string)
  // Parse connection string to get AccountName and AccountKey
  const match = AZ_CONN.match(/AccountName=([^;]+);AccountKey=([^;]+);/);
  if (!match) {
    // If connection string doesn't contain key (unlikely), return the blob URL (may be private)
    return blockBlobClient.url;
  }
  const accountName = match[1];
  const accountKey = match[2];
  const sharedKey = new StorageSharedKeyCredential(accountName, accountKey);

  const expiresOn = new Date(new Date().valueOf() + 15 * 60 * 1000); // 15 minutes
  const sasToken = generateBlobSASQueryParameters({
    containerName: AZ_CONTAINER,
    blobName: filename,
    permissions: ContainerSASPermissions.parse('r'),
    expiresOn
  }, sharedKey).toString();

  return `${blockBlobClient.url}?${sasToken}`;
}

// after imports and middleware
const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'];
const NAV_TIMEOUT = 120000; // 2 minutes

app.post('/render', async (req, res) => {
  const html = req.body || '<html><body><h1>No HTML provided</h1></body></html>';
  const width = parseInt(req.query.width) || 1200;
  const height = parseInt(req.query.height) || 800;
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: LAUNCH_ARGS,
      defaultViewport: { width, height },
      headless: true,
      // slowMo: 50 // uncomment if you want slowed rendering for debugging
    });

    const page = await browser.newPage();
    // capture console and page errors to logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(NAV_TIMEOUT);

    // use a conservative waitUntil and explicit timeout
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    // optional small delay to let fonts/resources stabilize (milliseconds)
    await page.waitForTimeout(500);

    const buffer = await page.screenshot({ type: 'png', fullPage: true, timeout: NAV_TIMEOUT });
    // proceed with blob upload / response as before
    const filename = `render-${Date.now()}.png`;
    const sasUrl = await uploadBufferAndGetSas(buffer, filename);
    res.json({ url: sasUrl, filename });
  } catch (err) {
    console.error('Render error', err);
    // include err.stack in response only for debugging; remove in production
    res.status(500).json({ error: 'Rendering failed', message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`html2png listening on ${port}`));
