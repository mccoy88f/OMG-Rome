const PluginBase = require('./plugin-base');
const axios = require('axios');

class YouTubePlugin extends PluginBase {
    constructor() {
        super();
        this.apiBase = 'https://www.googleapis.com/youtube/v3';
    }

    getName() {
        return 'youtube';
    }

    getDisplayName() {
        return 'YouTube';
    }

    getConfigSchema() {
        return {
            apiKey: { 
                type: 'string', 
                required: true, 
                label: 'YouTube API Key',
                description: 'Get from Google Cloud Console'
            },
            channels: { 
                type: 'array', 
                items: 'url', 
                required: false, 
                label: 'Canali Seguiti',
                description: 'URLs dei canali YouTube da seguire'
            }
        };
    }

    getCatalogs(config) {
        const catalogs = [{
            id: 'search',
            name: 'YouTube - Ricerca',
            extra: [
                { name: 'search', isRequired: true, options: [''] }
            ]
        }];

        // Add channels catalog if channels are configured
        if (config.channels && config.channels.length > 0) {
            catalogs.push({
                id: 'channels',
                name: 'YouTube - Canali Seguiti'
            });
        }

        return catalogs;
    }

    async search(query, config, limit = 25) {
        if (!config.apiKey) {
            throw new Error('YouTube API Key required');
        }

        try {
            const response = await axios.get(`${this.apiBase}/search`, {
                params: {
                    part: 'snippet',
                    q: query,
                    type: 'video',
                    maxResults: Math.min(50, limit),
                    key: config.apiKey,
                    regionCode: 'IT',
                    relevanceLanguage: 'it',
                    videoEmbeddable: 'any',
                    safeSearch: 'none'
                }
            });

            return response.data.items.map(item => this.formatVideoItem(item));
        } catch (error) {
            if (error.response && error.response.status === 403) {
                const errorData = error.response.data;
                if (errorData?.error?.errors?.[0]?.reason === 'quotaExceeded') {
                    throw new Error('YouTube API quota exceeded');
                } else if (errorData?.error?.errors?.[0]?.reason === 'keyInvalid') {
                    throw new Error('Invalid YouTube API key');
                }
            }
            throw new Error(`YouTube search failed: ${error.message}`);
        }
    }

    async getChannels(config, filter = null) {
        if (!config.channels || config.channels.length === 0) {
            return [];
        }

        const allVideos = [];
        
        for (const channelUrl of config.channels) {
            try {
                const channelId = await this.getChannelId(channelUrl, config.apiKey);
                if (channelId) {
                    const videos = await this.getChannelVideos(channelId, config.apiKey);
                    allVideos.push(...videos);
                }
            } catch (error) {
                console.error(`Error fetching channel ${channelUrl}:`, error.message);
            }
        }

        // Sort by published date (newest first)
        allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        
        return allVideos.slice(0, 25);
    }

    async getVideoMeta(videoId, config) {
        if (!config.apiKey) {
            throw new Error('YouTube API Key required');
        }

        try {
            const response = await axios.get(`${this.apiBase}/videos`, {
                params: {
                    part: 'snippet,contentDetails',
                    id: videoId,
                    key: config.apiKey
                }
            });

            if (response.data.items.length === 0) {
                throw new Error('Video not found');
            }

            const video = response.data.items[0];
            return this.formatVideoItem(video, true);
        } catch (error) {
            throw new Error(`Failed to get video metadata: ${error.message}`);
        }
    }

    async getVideoUrl(videoId, config) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    isVideoSupported(url) {
        return /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/.test(url);
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    // Private helper methods
    async getChannelId(channelUrl, apiKey) {
        try {
            const url = new URL(channelUrl);
            
            // Direct channel ID
            const channelIdMatch = url.pathname.match(/\/channel\/([A-Za-z0-9_-]{10,})/);
            if (channelIdMatch) {
                return channelIdMatch[1];
            }

            // Handle (@username)
            const handleMatch = url.pathname.match(/\/@([A-Za-z0-9._-]+)/);
            if (handleMatch) {
                const handle = handleMatch[1];
                try {
                    const response = await axios.get(`${this.apiBase}/search`, {
                        params: {
                            part: 'snippet',
                            q: `@${handle}`,
                            type: 'channel',
                            maxResults: 1,
                            key: apiKey
                        }
                    });
                    return response.data.items?.[0]?.snippet?.channelId;
                } catch (error) {
                    console.error(`Error finding channel for handle @${handle}:`, error.message);
                }
            }

            return null;
        } catch (error) {
            console.error('Error parsing channel URL:', error.message);
            return null;
        }
    }

    async getChannelVideos(channelId, apiKey, maxResults = 10) {
        try {
            const response = await axios.get(`${this.apiBase}/search`, {
                params: {
                    part: 'snippet',
                    channelId: channelId,
                    order: 'date',
                    type: 'video',
                    maxResults: maxResults,
                    key: apiKey
                }
            });

            return response.data.items.map(item => this.formatVideoItem(item));
        } catch (error) {
            throw new Error(`Failed to get channel videos: ${error.message}`);
        }
    }

    formatVideoItem(item, includeDetails = false) {
        const videoId = item.id?.videoId || item.id;
        const snippet = item.snippet || {};
        
        // Get best thumbnail
        const thumbnail = snippet.thumbnails?.maxres?.url ||
                         snippet.thumbnails?.standard?.url ||
                         snippet.thumbnails?.high?.url ||
                         snippet.thumbnails?.medium?.url ||
                         snippet.thumbnails?.default?.url ||
                         `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        // Format duration if available
        let duration = 'Video';
        if (item.contentDetails?.duration) {
            const match = item.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
                const hours = parseInt(match[1]) || 0;
                const minutes = parseInt(match[2]) || 0;
                const seconds = parseInt(match[3]) || 0;
                const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                duration = this.formatDuration(totalSeconds);
            }
        }

        return {
            id: videoId,
            title: this.sanitizeString(snippet.title) || 'Untitled Video',
            description: this.sanitizeString(snippet.description) || '',
            thumbnail: thumbnail,
            channelTitle: this.sanitizeString(snippet.channelTitle) || 'Unknown Channel',
            publishedAt: snippet.publishedAt || new Date().toISOString(),
            duration: duration
        };
    }
}

module.exports = YouTubePlugin;