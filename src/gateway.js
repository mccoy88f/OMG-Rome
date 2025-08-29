const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const PluginManager = require('./plugin-manager');
const StreamingService = require('./streaming');

const APP_PORT = process.env.PORT || 3100;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(morgan('dev'));

const pluginManager = new PluginManager();
const streaming = new StreamingService();

// Utility to decode base64 config
function decodeConfig(configParam) {
    try {
        if (!configParam) return {};
        const configJson = Buffer.from(configParam, 'base64').toString('utf8');
        return JSON.parse(configJson);
    } catch (error) {
        console.error('Config decode error:', error.message);
        return {};
    }
}

// Build dynamic manifest based on active plugins and their configs
function buildManifest(req) {
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    const config = decodeConfig(req.query.config);
    const activePlugins = pluginManager.getActivePlugins(config);
    
    // Build catalogs from active plugins
    const catalogs = [];
    activePlugins.forEach(plugin => {
        const pluginCatalogs = plugin.getCatalogs(config[plugin.getName()] || {});
        pluginCatalogs.forEach(catalog => {
            catalogs.push({
                type: 'movie',
                id: `${plugin.getName()}-${catalog.id}`,
                name: catalog.name,
                extra: catalog.extra || []
            });
        });
    });

    return {
        id: 'com.omg.rome',
        name: 'OMG Rome - Universal Video Gateway',
        description: 'Multi-platform video streaming addon',
        version: '1.0.0',
        logo: `${baseUrl}/logo.png`,
        background: `${baseUrl}/background.jpg`,
        resources: ['catalog', 'stream', 'meta'],
        types: ['movie'],
        idPrefixes: activePlugins.map(p => p.getName()),
        catalogs
    };
}

// Manifest endpoint
app.get('/manifest.json', (req, res) => {
    try {
        const manifest = buildManifest(req);
        res.json(manifest);
    } catch (error) {
        console.error('Manifest error:', error);
        res.status(500).json({ error: 'Manifest generation failed' });
    }
});

// Catalog endpoint
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
    try {
        const { type, id, extra } = req.params;
        const config = decodeConfig(req.query.config);
        
        // Parse plugin name and catalog type from id
        const [pluginName, catalogType] = id.split('-');
        const plugin = pluginManager.getPlugin(pluginName);
        
        if (!plugin) {
            return res.status(404).json({ error: 'Plugin not found' });
        }

        let metas = [];
        
        if (catalogType === 'search') {
            // Extract search query
            let searchQuery = extra ? decodeURIComponent(extra) : '';
            if (searchQuery.startsWith('search=')) {
                searchQuery = searchQuery.substring(7);
            }
            
            if (searchQuery) {
                const results = await plugin.search(searchQuery, config[pluginName] || {});
                metas = results.map(video => ({
                    id: `${pluginName}_${video.id}`,
                    type: 'movie',
                    name: video.title,
                    description: video.description,
                    poster: video.thumbnail,
                    posterShape: 'landscape',
                    background: video.thumbnail,
                    director: [video.channelTitle],
                    cast: [video.channelTitle],
                    releaseInfo: video.duration || 'Video',
                    year: new Date(video.publishedAt).getFullYear(),
                    released: video.publishedAt
                }));
            }
        } else if (catalogType === 'channels' || catalogType === 'categories') {
            // Get channel/category content
            const results = await plugin.getChannels(config[pluginName] || {}, extra);
            metas = results.map(video => ({
                id: `${pluginName}_${video.id}`,
                type: 'movie',
                name: video.title,
                description: video.description,
                poster: video.thumbnail,
                posterShape: 'landscape',
                background: video.thumbnail,
                director: [video.channelTitle],
                cast: [video.channelTitle],
                genre: [video.channelTitle],
                releaseInfo: video.duration || 'Video',
                year: new Date(video.publishedAt).getFullYear(),
                released: video.publishedAt
            }));
        }

        res.json({ metas });
    } catch (error) {
        console.error('Catalog error:', error);
        res.json({ metas: [] });
    }
});

// Stream endpoint
app.get('/stream/:type/:id.json', async (req, res) => {
    try {
        const { id } = req.params;
        const config = decodeConfig(req.query.config);
        
        // Parse plugin name and video ID
        const [pluginName, videoId] = id.split('_');
        const plugin = pluginManager.getPlugin(pluginName);
        
        if (!plugin) {
            return res.status(404).json({ error: 'Plugin not found' });
        }

        // Build stream URL with config
        const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const host = req.get('x-forwarded-host') || req.get('host');
        const baseUrl = `${protocol}://${host}`;
        
        const streamUrl = req.query.config ? 
            `${baseUrl}/proxy/${pluginName}/${videoId}?config=${req.query.config}` :
            `${baseUrl}/proxy/${pluginName}/${videoId}`;

        res.json({
            streams: [{
                url: streamUrl,
                title: 'Migliore Qualità Disponibile'
            }]
        });
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ error: 'Stream generation failed' });
    }
});

// Meta endpoint
app.get('/meta/:type/:id.json', async (req, res) => {
    try {
        const { id } = req.params;
        const config = decodeConfig(req.query.config);
        
        // Parse plugin name and video ID
        const [pluginName, videoId] = id.split('_');
        const plugin = pluginManager.getPlugin(pluginName);
        
        if (!plugin) {
            return res.status(404).json({ error: 'Plugin not found' });
        }

        const videoMeta = await plugin.getVideoMeta(videoId, config[pluginName] || {});
        
        const meta = {
            id: id,
            type: 'movie',
            name: videoMeta.title,
            description: videoMeta.description,
            poster: videoMeta.thumbnail,
            posterShape: 'landscape',
            background: videoMeta.thumbnail,
            director: [videoMeta.channelTitle],
            cast: [videoMeta.channelTitle],
            releaseInfo: videoMeta.duration || 'Video',
            year: new Date(videoMeta.publishedAt).getFullYear(),
            released: videoMeta.publishedAt
        };

        res.json({ meta });
    } catch (error) {
        console.error('Meta error:', error);
        res.status(500).json({ error: 'Meta generation failed' });
    }
});

// Proxy streaming endpoint
app.get('/proxy/:pluginName/:videoId', async (req, res) => {
    try {
        const { pluginName, videoId } = req.params;
        const config = decodeConfig(req.query.config);
        
        const plugin = pluginManager.getPlugin(pluginName);
        if (!plugin) {
            return res.status(404).json({ error: 'Plugin not found' });
        }

        // Get video URL from plugin
        const videoUrl = await plugin.getVideoUrl(videoId, config[pluginName] || {});
        
        // Create yt-dlp stream
        const videoStream = await streaming.createStream(videoUrl);
        
        // Set streaming headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        
        // Handle client disconnect
        req.on('close', () => {
            if (videoStream && videoStream.destroy) {
                videoStream.destroy();
            }
        });

        videoStream.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming failed' });
        }
    }
});

// Configuration endpoint for frontend
app.get('/api/plugins', (req, res) => {
    const plugins = pluginManager.getAllPlugins().map(plugin => ({
        name: plugin.getName(),
        displayName: plugin.getDisplayName(),
        configSchema: plugin.getConfigSchema()
    }));
    res.json({ plugins });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        plugins: pluginManager.getAllPlugins().map(p => p.getName())
    });
});

// Frontend (basic for now)
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head><title>OMG Rome - Universal Video Gateway</title></head>
        <body>
            <h1>OMG Rome</h1>
            <p>Universal Stremio addon gateway</p>
            <p><a href="/api/plugins">Available Plugins</a></p>
            <p><a href="/manifest.json">Base Manifest</a></p>
        </body>
        </html>
    `);
});

app.listen(APP_PORT, () => {
    console.log(`OMG Rome Gateway listening on port ${APP_PORT}`);
    console.log(`Available plugins: ${pluginManager.getAllPlugins().map(p => p.getName()).join(', ')}`);
    console.log(`Manifest: http://localhost:${APP_PORT}/manifest.json`);
});