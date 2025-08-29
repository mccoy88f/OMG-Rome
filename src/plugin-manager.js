const path = require('path');
const fs = require('fs');

class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.loadPlugins();
    }

    loadPlugins() {
        const pluginsDir = path.join(__dirname, 'plugins');
        
        if (!fs.existsSync(pluginsDir)) {
            console.warn('Plugins directory not found');
            return;
        }

        const pluginFiles = fs.readdirSync(pluginsDir)
            .filter(file => file.endsWith('.js') && file !== 'plugin-base.js');

        pluginFiles.forEach(file => {
            try {
                const PluginClass = require(path.join(pluginsDir, file));
                const plugin = new PluginClass();
                this.plugins.set(plugin.getName(), plugin);
                console.log(`Plugin loaded: ${plugin.getName()}`);
            } catch (error) {
                console.error(`Failed to load plugin ${file}:`, error.message);
            }
        });
    }

    getPlugin(name) {
        return this.plugins.get(name);
    }

    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    getActivePlugins(config = {}) {
        return Array.from(this.plugins.values()).filter(plugin => {
            const pluginConfig = config[plugin.getName()];
            return pluginConfig && this.isPluginConfigured(plugin, pluginConfig);
        });
    }

    isPluginConfigured(plugin, config) {
        const schema = plugin.getConfigSchema();
        
        // Check if all required fields are present
        for (const [key, field] of Object.entries(schema)) {
            if (field.required && (!config[key] || config[key] === '')) {
                return false;
            }
        }
        
        return true;
    }

    validatePluginConfig(pluginName, config) {
        const plugin = this.getPlugin(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }

        const schema = plugin.getConfigSchema();
        const errors = [];

        for (const [key, field] of Object.entries(schema)) {
            const value = config[key];

            // Required field validation
            if (field.required && (!value || value === '')) {
                errors.push(`${key} is required`);
                continue;
            }

            // Type validation
            if (value !== undefined && value !== '') {
                if (field.type === 'string' && typeof value !== 'string') {
                    errors.push(`${key} must be a string`);
                } else if (field.type === 'number' && typeof value !== 'number') {
                    errors.push(`${key} must be a number`);
                } else if (field.type === 'array' && !Array.isArray(value)) {
                    errors.push(`${key} must be an array`);
                }

                // Min/max validation for numbers
                if (field.type === 'number' && typeof value === 'number') {
                    if (field.min !== undefined && value < field.min) {
                        errors.push(`${key} must be at least ${field.min}`);
                    }
                    if (field.max !== undefined && value > field.max) {
                        errors.push(`${key} must be at most ${field.max}`);
                    }
                }

                // Array items validation
                if (field.type === 'array' && Array.isArray(value) && field.items) {
                    if (field.items === 'string') {
                        value.forEach((item, index) => {
                            if (typeof item !== 'string') {
                                errors.push(`${key}[${index}] must be a string`);
                            }
                        });
                    } else if (field.items === 'url') {
                        value.forEach((item, index) => {
                            if (typeof item !== 'string' || !this.isValidUrl(item)) {
                                errors.push(`${key}[${index}] must be a valid URL`);
                            }
                        });
                    }
                }
            }
        }

        return errors;
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}

module.exports = PluginManager;