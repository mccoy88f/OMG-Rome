class PluginBase {
    constructor() {
        if (this.constructor === PluginBase) {
            throw new Error('Cannot instantiate abstract class PluginBase');
        }
    }

    // Plugin identification
    getName() {
        throw new Error('getName() must be implemented');
    }

    getDisplayName() {
        throw new Error('getDisplayName() must be implemented');
    }

    // Configuration schema for frontend
    getConfigSchema() {
        throw new Error('getConfigSchema() must be implemented');
    }

    // Available catalogs for this plugin
    getCatalogs(config) {
        throw new Error('getCatalogs() must be implemented');
    }

    // Search functionality
    async search(query, config, limit = 25) {
        throw new Error('search() must be implemented');
    }

    // Get content from followed channels/categories
    async getChannels(config, filter = null) {
        throw new Error('getChannels() must be implemented');
    }

    // Get detailed video metadata
    async getVideoMeta(videoId, config) {
        throw new Error('getVideoMeta() must be implemented');
    }

    // Get video URL for streaming
    async getVideoUrl(videoId, config) {
        throw new Error('getVideoUrl() must be implemented');
    }

    // Check if a URL is supported by this plugin
    isVideoSupported(url) {
        return false;
    }

    // Utility methods
    extractVideoId(url) {
        return null;
    }

    formatDuration(seconds) {
        if (!seconds) return 'N/A';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    sanitizeString(str) {
        if (!str) return '';
        return str.replace(/[<>]/g, '').trim();
    }

    validateConfig(config) {
        const schema = this.getConfigSchema();
        const errors = [];

        for (const [key, field] of Object.entries(schema)) {
            const value = config[key];

            if (field.required && (!value || value === '')) {
                errors.push(`${key} is required`);
            }
        }

        return errors;
    }
}

module.exports = PluginBase;