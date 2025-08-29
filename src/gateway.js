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
        if (!configParam || configParam === '') return {};
        
        // Clean base64 string
        const cleanBase64 = configParam.replace(/[^A-Za-z0-9+/=]/g, '');
        
        // Decode base64
        const configJson = Buffer.from(cleanBase64, 'base64').toString('utf8');
        
        // Parse JSON with additional validation
        if (!configJson || configJson.trim() === '') return {};
        
        const config = JSON.parse(configJson);
        return config || {};
        
    } catch (error) {
        console.error('Config decode error:', error.message);
        console.error('Config param was:', configParam ? configParam.substring(0, 50) + '...' : 'empty');
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
            // Search catalogs as movies, channel feeds as channels
            const contentType = catalog.id === 'search' ? 'movie' : 'channel';
            catalogs.push({
                type: contentType,
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
        types: ['movie', 'channel'],
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
                type: 'channel',
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

        // Build stream URLs with config
        const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const host = req.get('x-forwarded-host') || req.get('host');
        const baseUrl = `${protocol}://${host}`;
        
        const baseStreamUrl = req.query.config ? 
            `${baseUrl}/proxy/${pluginName}/${videoId}?config=${req.query.config}` :
            `${baseUrl}/proxy/${pluginName}/${videoId}`;

        res.json({
            streams: [
                {
                    url: `${baseStreamUrl}?quality=fast`,
                    title: 'Qualità Rapida (720p) - Audio+Video Sincronizzati',
                    quality: 'fast'
                },
                {
                    url: `${baseStreamUrl}?quality=best`,
                    title: 'Migliore Qualità Disponibile - Richiede Merge',
                    quality: 'best'
                }
            ]
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
        const quality = req.query.quality || 'best'; // Default to best quality
        
        const plugin = pluginManager.getPlugin(pluginName);
        if (!plugin) {
            return res.status(404).json({ error: 'Plugin not found' });
        }

        // Get video URL from plugin
        const videoUrl = await plugin.getVideoUrl(videoId, config[pluginName] || {});
        
        // Choose streaming method based on quality preference
        let videoStream;
        if (quality === 'fast') {
            console.log(`        Using FAST stream (pre-merged) for ${videoUrl}`);
            videoStream = await streaming.createFastStream(videoUrl);
        } else {
            console.log(`        Using BEST quality stream (with merge) for ${videoUrl}`);
            videoStream = await streaming.createStream(videoUrl);
        }
        
        // Set streaming headers optimized for Stremio compatibility
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Encoding');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        // Handle HEAD requests from video players
        if (req.method === 'HEAD') {
            res.status(200).end();
            return;
        }
        
        // Handle Range requests for better Stremio compatibility
        if (req.headers.range) {
            console.log(`        Range request: ${req.headers.range}`);
        }
        
        // Handle client disconnect
        req.on('close', () => {
            console.log('Client disconnected, killing stream');
            if (videoStream && videoStream.destroy) {
                videoStream.destroy();
            }
        });

        req.on('aborted', () => {
            console.log('Request aborted, killing stream');
            if (videoStream && videoStream.destroy) {
                videoStream.destroy();
            }
        });

        // Handle stream errors
        videoStream.on('error', (error) => {
            console.error('Video stream error:', error.message);
            if (!res.headersSent) {
                res.status(500).end();
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

// Frontend configuration interface
app.get('/', (req, res) => {
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OMG Rome - Universal Video Gateway</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 30px; }
        .plugin { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
        .plugin h3 { margin-top: 0; color: #495057; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: 600; color: #495057; }
        input[type="text"], input[type="number"], textarea { width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; }
        input[type="text"]:focus, input[type="number"]:focus, textarea:focus { outline: none; border-color: #007bff; box-shadow: 0 0 0 2px rgba(0,123,255,0.25); }
        .array-input { margin-bottom: 5px; }
        .add-item { background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; }
        .remove-item { background: #dc3545; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; margin-left: 10px; }
        .generate-btn { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: 600; }
        .generate-btn:hover { background: #0056b3; }
        .result { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; padding: 15px; margin-top: 20px; }
        .manifest-url { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; word-break: break-all; margin: 10px 0; border: 1px solid #dee2e6; }
        .stremio-btn { background: #6c5ce7; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; display: inline-block; margin-top: 10px; }
        .copy-btn { background: #6c757d; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 10px; }
        .description { color: #6c757d; font-size: 12px; margin-top: 2px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>OMG Rome</h1>
        <p class="subtitle">Universal Video Gateway - Configure your plugins</p>
        
        <div id="plugins-container">
            Loading plugins...
        </div>
        
        <button class="generate-btn" onclick="generateManifest()">Generate Manifest URL</button>
        
        <div id="result" style="display: none;">
            <h3>✅ Manifest Ready</h3>
            <div class="manifest-url" id="manifest-url"></div>
            <button class="copy-btn" onclick="copyManifest()">Copy URL</button>
            <a href="#" id="stremio-link" class="stremio-btn">Install in Stremio</a>
        </div>
    </div>

    <script>
        let pluginsData = {};
        
        // Load plugins on page load
        document.addEventListener('DOMContentLoaded', loadPlugins);
        
        async function loadPlugins() {
            try {
                const response = await fetch('/api/plugins');
                const data = await response.json();
                pluginsData = data.plugins;
                renderPlugins();
            } catch (error) {
                document.getElementById('plugins-container').innerHTML = 
                    '<div style="color: red;">Error loading plugins: ' + error.message + '</div>';
            }
        }
        
        function renderPlugins() {
            const container = document.getElementById('plugins-container');
            container.innerHTML = '';
            
            pluginsData.forEach(plugin => {
                const pluginDiv = document.createElement('div');
                pluginDiv.className = 'plugin';
                pluginDiv.innerHTML = \`
                    <h3>\${plugin.displayName}</h3>
                    <div id="plugin-\${plugin.name}"></div>
                \`;
                container.appendChild(pluginDiv);
                
                renderPluginForm(plugin);
            });
        }
        
        function renderPluginForm(plugin) {
            const container = document.getElementById(\`plugin-\${plugin.name}\`);
            let formHtml = '';
            
            Object.entries(plugin.configSchema).forEach(([key, field]) => {
                formHtml += \`<div class="form-group">\`;
                formHtml += \`<label for="\${plugin.name}-\${key}">\${field.label}\`;
                if (field.required) formHtml += ' *';
                formHtml += '</label>';
                
                if (field.description) {
                    formHtml += \`<div class="description">\${field.description}</div>\`;
                }
                
                if (field.type === 'string') {
                    formHtml += \`<input type="text" id="\${plugin.name}-\${key}" 
                                placeholder="\${field.label}" \${field.required ? 'required' : ''}>\`;
                } else if (field.type === 'number') {
                    formHtml += \`<input type="number" id="\${plugin.name}-\${key}" 
                                min="\${field.min || ''}" max="\${field.max || ''}" 
                                placeholder="\${field.default || ''}" \${field.required ? 'required' : ''}>\`;
                } else if (field.type === 'array') {
                    formHtml += \`<div id="\${plugin.name}-\${key}-container">
                                   <input type="text" class="array-input" placeholder="Enter \${field.items || 'item'}">
                                 </div>
                                 <button type="button" class="add-item" onclick="addArrayItem('\${plugin.name}', '\${key}', '\${field.items}')">
                                   Add \${field.label}
                                 </button>\`;
                }
                
                formHtml += '</div>';
            });
            
            container.innerHTML = formHtml;
        }
        
        function addArrayItem(pluginName, fieldKey, itemType) {
            const container = document.getElementById(\`\${pluginName}-\${fieldKey}-container\`);
            const inputs = container.querySelectorAll('.array-input');
            const lastInput = inputs[inputs.length - 1];
            
            if (lastInput.value.trim()) {
                const newInput = document.createElement('input');
                newInput.type = 'text';
                newInput.className = 'array-input';
                newInput.placeholder = \`Enter \${itemType || 'item'}\`;
                
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-item';
                removeBtn.textContent = 'Remove';
                removeBtn.onclick = () => {
                    newInput.remove();
                    removeBtn.remove();
                };
                
                container.appendChild(newInput);
                container.appendChild(removeBtn);
            }
        }
        
        function generateManifest() {
            const config = {};
            let hasValidConfig = false;
            
            pluginsData.forEach(plugin => {
                const pluginConfig = {};
                let hasPluginConfig = false;
                
                Object.entries(plugin.configSchema).forEach(([key, field]) => {
                    if (field.type === 'array') {
                        const container = document.getElementById(\`\${plugin.name}-\${key}-container\`);
                        const inputs = container.querySelectorAll('.array-input');
                        const values = Array.from(inputs)
                            .map(input => input.value.trim())
                            .filter(value => value !== '');
                        
                        if (values.length > 0) {
                            pluginConfig[key] = values;
                            hasPluginConfig = true;
                        }
                    } else {
                        const input = document.getElementById(\`\${plugin.name}-\${key}\`);
                        if (input && input.value.trim()) {
                            pluginConfig[key] = field.type === 'number' ? 
                                parseInt(input.value) : input.value.trim();
                            hasPluginConfig = true;
                        }
                    }
                });
                
                if (hasPluginConfig) {
                    config[plugin.name] = pluginConfig;
                    hasValidConfig = true;
                }
            });
            
            if (!hasValidConfig) {
                alert('Please configure at least one plugin');
                return;
            }
            
            // Generate base64 config
            const configJson = JSON.stringify(config);
            const configBase64 = btoa(unescape(encodeURIComponent(configJson)));
            const manifestUrl = \`${baseUrl}/manifest.json?config=\${configBase64}\`;
            
            // Show result
            document.getElementById('manifest-url').textContent = manifestUrl;
            document.getElementById('stremio-link').href = manifestUrl.replace(/^https?:/, 'stremio:');
            document.getElementById('result').style.display = 'block';
            
            // Scroll to result
            document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
        }
        
        function copyManifest() {
            const manifestUrl = document.getElementById('manifest-url').textContent;
            navigator.clipboard.writeText(manifestUrl).then(() => {
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = '#28a745';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '#6c757d';
                }, 2000);
            });
        }
    </script>
</body>
</html>
    `);
});

app.listen(APP_PORT, () => {
    console.log(`OMG Rome Gateway listening on port ${APP_PORT}`);
    console.log(`Available plugins: ${pluginManager.getAllPlugins().map(p => p.getName()).join(', ')}`);
    console.log(`Manifest: http://localhost:${APP_PORT}/manifest.json`);
});
