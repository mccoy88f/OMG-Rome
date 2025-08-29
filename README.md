# OMG Rome - Universal Video Gateway

Universal Stremio addon gateway with pluggable video sources architecture.

## Architecture

- **Gateway**: Express.js server handling Stremio protocol
- **Plugin System**: Modular video source plugins 
- **Streaming**: yt-dlp integration for universal video streaming
- **Configuration**: Stateless base64 encoded configs

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/mccoy88f/OMG-Rome
cd OMG-Rome
docker-compose up -d
```

### Manual Setup

```bash
# Install dependencies
npm install

# Install yt-dlp
pip install yt-dlp

# Start server
npm start
```

Server runs on http://localhost:3100

## Plugin Development

### Creating a New Plugin

1. Create file `src/plugins/yourservice.js`
2. Extend `PluginBase` class
3. Implement required methods

### Plugin Template

```javascript
const PluginBase = require('./plugin-base');

class YourServicePlugin extends PluginBase {
    getName() {
        return 'yourservice';
    }

    getDisplayName() {
        return 'Your Service';
    }

    getConfigSchema() {
        return {
            apiKey: { 
                type: 'string', 
                required: true, 
                label: 'API Key' 
            },
            categories: { 
                type: 'array', 
                items: 'string', 
                required: false, 
                label: 'Categories' 
            }
        };
    }

    getCatalogs(config) {
        return [{
            id: 'search',
            name: 'Your Service - Search',
            extra: [{ name: 'search', isRequired: true, options: [''] }]
        }];
    }

    async search(query, config, limit = 25) {
        // Implement search logic
        // Return array of video objects
    }

    async getChannels(config, filter = null) {
        // Implement channels/categories logic
        // Return array of video objects
    }

    async getVideoMeta(videoId, config) {
        // Return detailed video metadata
    }

    async getVideoUrl(videoId, config) {
        // Return URL that yt-dlp can process
        return `https://yourservice.com/watch/${videoId}`;
    }
}

module.exports = YourServicePlugin;
```

### Video Object Format

```javascript
{
    id: 'unique_video_id',
    title: 'Video Title',
    description: 'Video description',
    thumbnail: 'https://thumbnail.url',
    channelTitle: 'Channel/Creator Name',
    publishedAt: '2023-01-01T00:00:00Z',
    duration: '5:30'  // or 'Video' if unknown
}
```

### Plugin Methods

| Method | Purpose | Required |
|--------|---------|----------|
| `getName()` | Plugin identifier | Yes |
| `getDisplayName()` | Human readable name | Yes |
| `getConfigSchema()` | Configuration schema | Yes |
| `getCatalogs(config)` | Available catalogs | Yes |
| `search(query, config)` | Search videos | Yes |
| `getChannels(config)` | Get followed content | No |
| `getVideoMeta(videoId, config)` | Video metadata | Yes |
| `getVideoUrl(videoId, config)` | Video URL for streaming | Yes |

### Configuration Schema Types

- `string`: Text input
- `number`: Number input with optional min/max
- `array`: Array of items (string/url)
- `select`: Dropdown with predefined options

### Testing Plugin

1. Restart server to load new plugin
2. Check `/api/plugins` endpoint
3. Configure plugin in frontend
4. Test search and streaming

## API Endpoints

- `GET /manifest.json?config=<base64>` - Stremio manifest
- `GET /catalog/:type/:id/:extra?.json` - Video catalogs  
- `GET /stream/:type/:id.json` - Stream URLs
- `GET /meta/:type/:id.json` - Video metadata
- `GET /proxy/:plugin/:videoId` - Video streaming proxy
- `GET /api/plugins` - Available plugins info

## Configuration

All configuration is stateless via base64 encoded URL parameters:

```
/manifest.json?config=eyJwbHVnaW5zIjp7InlvdXR1YmUiOnsiYXBpS2V5IjoiLi4uIn19fQ==
```

Decoded config structure:
```json
{
  "youtube": {
    "apiKey": "your_api_key",
    "channels": ["https://youtube.com/@channel"]
  },
  "anotherservice": {
    "categories": ["category1", "category2"]
  }
}
```

## Current Plugins

- **YouTube**: Search and channel feeds via YouTube Data API

## Legal Notice

This software is for educational purposes. Users are responsible for compliance with terms of service of video platforms and applicable laws in their jurisdiction.

## License

MIT - see LICENSE file

## Contributing

1. Fork repository
2. Create plugin following template
3. Test functionality
4. Submit pull request

Plugin contributions should include:
- Complete plugin implementation
- Documentation updates
- Example configuration