const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Security: Only allow Telegram Web App requests
app.use((req, res, next) => {
    // Check if request is from Telegram Web App
    const userAgent = req.get('User-Agent') || '';
    const referer = req.get('Referer') || '';
    const origin = req.get('Origin') || '';
    
    // Block if not from Telegram
    if (!userAgent.includes('Telegram') && !referer.includes('tgWebApp') && !origin.includes('telegram')) {
        // For API requests, block non-Telegram access
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                error: 'This app can only be accessed through Telegram',
                message: 'Please open this app from Telegram'
            });
        }
    }
    next();
});

// Performance test endpoint
app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;
    
    // Verify Telegram Web App data
    const userAgent = req.get('User-Agent') || '';
    if (!userAgent.includes('Telegram')) {
        return res.status(403).json({ 
            error: 'Access denied',
            message: 'This service is only available through Telegram'
        });
    }

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const startTime = Date.now();
        
        // Fetch the website
        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const loadTime = Date.now() - startTime;
        const html = response.data;
        const $ = cheerio.load(html);

        // Calculate metrics
        const metrics = analyzePerformance($, html, loadTime, url);
        
        res.json({
            success: true,
            metrics: metrics,
            url: url
        });

    } catch (error) {
        console.error('Error analyzing website:', error);
        res.status(500).json({
            error: 'Failed to analyze website',
            details: error.message
        });
    }
});

function analyzePerformance($, html, loadTime, url) {
    // 1. Page size
    const pageSize = Buffer.byteLength(html, 'utf8');
    
    // 2. Count elements
    const totalElements = $('*').length;
    const images = $('img').length;
    const scripts = $('script').length;
    const stylesheets = $('link[rel="stylesheet"]').length;
    const externalLinks = $('a[href^="http"]').length;
    
    // 3. HTML structure analysis
    const hasMetaDescription = $('meta[name="description"]').length > 0;
    const hasMetaKeywords = $('meta[name="keywords"]').length > 0;
    const hasViewport = $('meta[name="viewport"]').length > 0;
    const hasTitle = $('title').length > 0;
    const hasFavicon = $('link[rel="icon"]').length > 0 || $('link[rel="shortcut icon"]').length > 0;
    
    // 4. Check for best practices
    const hasAltTags = $('img[alt]').length > 0;
    const totalImagesWithAlt = $('img[alt]').length;
    const imagesWithoutAlt = images - totalImagesWithAlt;
    
    // 5. SSL Check
    const hasSSL = url.startsWith('https://');
    
    // 6. Internal vs External links
    const internalLinks = $('a[href^="/"]').length + $('a[href^="./"]').length + $('a[href^="../"]').length;
    
    // 7. Performance score calculation (simplified)
    let performanceScore = 100;
    
    if (pageSize > 1000000) performanceScore -= 10;
    else if (pageSize > 500000) performanceScore -= 5;
    
    if (scripts > 20) performanceScore -= 5;
    else if (scripts > 10) performanceScore -= 2;
    
    if (imagesWithoutAlt > 5) performanceScore -= 5;
    else if (imagesWithoutAlt > 0) performanceScore -= 2;
    
    if (!hasMetaDescription) performanceScore -= 3;
    if (!hasMetaKeywords) performanceScore -= 2;
    if (!hasViewport) performanceScore -= 3;
    if (!hasTitle) performanceScore -= 5;
    
    if (loadTime > 5000) performanceScore -= 10;
    else if (loadTime > 3000) performanceScore -= 5;
    
    if (hasSSL) performanceScore += 5;
    
    performanceScore = Math.max(0, Math.min(100, performanceScore));
    
    let grade;
    if (performanceScore >= 90) grade = 'A+';
    else if (performanceScore >= 80) grade = 'A';
    else if (performanceScore >= 70) grade = 'B';
    else if (performanceScore >= 60) grade = 'C';
    else if (performanceScore >= 50) grade = 'D';
    else grade = 'F';

    return {
        pageSize: formatBytes(pageSize),
        loadTime: `${loadTime}ms`,
        totalElements,
        images,
        scripts,
        stylesheets,
        externalLinks,
        internalLinks,
        hasMetaDescription,
        hasMetaKeywords,
        hasViewport,
        hasTitle,
        hasFavicon,
        hasAltTags,
        imagesWithoutAlt,
        hasSSL,
        performanceScore,
        grade,
        details: {
            htmlSize: pageSize,
            loadTimeMs: loadTime,
            elements: {
                total: totalElements,
                images: images,
                scripts: scripts,
                stylesheets: stylesheets,
                links: {
                    external: externalLinks,
                    internal: internalLinks
                }
            }
        }
    };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Serve the mini app - with Telegram-only check
app.get('/', (req, res) => {
    const userAgent = req.get('User-Agent') || '';
    const isTelegram = userAgent.includes('Telegram');
    
    // If not from Telegram, show restricted access page
    if (!isTelegram) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Access Restricted</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: #1a1a2e;
                        color: white;
                        text-align: center;
                        padding: 20px;
                    }
                    .container {
                        max-width: 400px;
                    }
                    .icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    h1 {
                        color: #e94560;
                        margin-bottom: 16px;
                    }
                    p {
                        color: #ccc;
                        line-height: 1.6;
                        margin-bottom: 20px;
                    }
                    .btn {
                        display: inline-block;
                        padding: 12px 30px;
                        background: #e94560;
                        color: white;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 600;
                        transition: background 0.3s;
                    }
                    .btn:hover {
                        background: #c73e54;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🚫</div>
                    <h1>Access Restricted</h1>
                    <p>This application can only be accessed through the Telegram app.</p>
                    <p style="font-size: 14px; color: #888;">Please open this link from within Telegram</p>
                    <a href="https://t.me/your_bot_username" class="btn">Open in Telegram</a>
                </div>
            </body>
            </html>
        `);
    }
    
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Block direct access to all other routes
app.use('*', (req, res) => {
    const userAgent = req.get('User-Agent') || '';
    if (!userAgent.includes('Telegram')) {
        res.status(403).json({ 
            error: 'Access Denied',
            message: 'This service is only available through Telegram'
        });
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access via Telegram only`);
});
