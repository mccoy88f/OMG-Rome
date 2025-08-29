# 🚀 Guida allo Sviluppo di Plugin per OMG Rome

Questa guida ti spiega come creare plugin per OMG Rome, il gateway universale per lo streaming video multi-piattaforma.

## 📋 Indice

- [Struttura di un Plugin](#struttura-di-un-plugin)
- [Metodi Obbligatori](#metodi-obbligatori)
- [Metodi Opzionali](#metodi-opzionali)
- [Esempio Completo](#esempio-completo)
- [Installazione e Test](#installazione-e-test)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## 🏗️ Struttura di un Plugin

Un plugin per OMG Rome deve estendere la classe `PluginBase` e implementare i metodi richiesti:

```javascript
const PluginBase = require('./plugin-base');

class MyPlugin extends PluginBase {
    constructor() {
        super();
        // Inizializzazione del plugin
    }
    
    // Implementazione dei metodi richiesti...
}

module.exports = MyPlugin;
```

## ⚡ Metodi Obbligatori

### `getName()`
Restituisce l'identificatore univoco del plugin (es. 'youtube', 'vimeo').

```javascript
getName() {
    return 'myplugin';
}
```

### `getDisplayName()`
Restituisce il nome visualizzato nell'interfaccia utente.

```javascript
getDisplayName() {
    return 'My Video Platform';
}
```

### `getConfigSchema()`
Definisce lo schema di configurazione per il frontend.

```javascript
getConfigSchema() {
    return {
        apiKey: { 
            type: 'string', 
            required: true, 
            label: 'API Key',
            description: 'La tua API key per il servizio'
        },
        maxResults: { 
            type: 'number', 
            required: false, 
            label: 'Risultati Massimi',
            min: 10,
            max: 100,
            default: 25
        }
    };
}
```

**Tipi di campo supportati:**
- `string`: Campo di testo
- `number`: Campo numerico
- `array`: Lista di valori
- `boolean`: Checkbox

### `getCatalogs(config)`
Restituisce i cataloghi disponibili per questo plugin.

```javascript
getCatalogs(config) {
    return [
        {
            id: 'search',
            name: 'Ricerca Video',
            extra: [
                { name: 'search', isRequired: true, options: [''] }
            ]
        },
        {
            id: 'trending',
            name: 'Video in Tendenza'
        }
    ];
}
```

### `async search(query, config, limit = 25)`
Implementa la ricerca video.

```javascript
async search(query, config, limit = 25) {
    // Implementa la logica di ricerca
    const results = await this.performSearch(query, config, limit);
    
    return results.map(item => this.formatVideoItem(item));
}
```

### `async getChannels(config, filter = null)`
Restituisce i video dai canali seguiti.

```javascript
async getChannels(config, filter = null) {
    if (!config.channels) return [];
    
    const videos = [];
    for (const channel of config.channels) {
        const channelVideos = await this.getChannelVideos(channel, config);
        videos.push(...channelVideos);
    }
    
    return videos.slice(0, 25); // Limite di default
}
```

### `async getVideoMeta(videoId, config)`
Restituisce i metadati dettagliati di un video.

```javascript
async getVideoMeta(videoId, config) {
    const videoInfo = await this.fetchVideoInfo(videoId, config);
    
    return {
        id: videoInfo.id,
        title: videoInfo.title,
        description: videoInfo.description,
        thumbnail: videoInfo.thumbnail,
        duration: videoInfo.duration,
        // ... altri metadati
    };
}
```

### `async getVideoUrl(videoId, config)`
Restituisce l'URL del video per lo streaming.

```javascript
async getVideoUrl(videoId, config) {
    const videoUrl = await this.resolveVideoUrl(videoId, config);
    
    if (!videoUrl) {
        throw new Error('Video non disponibile');
    }
    
    return videoUrl;
}
```

## 🔧 Metodi Opzionali

### `isVideoSupported(url)`
Verifica se un URL è supportato dal plugin.

```javascript
isVideoSupported(url) {
    return url.includes('myp platform.com');
}
```

### `extractVideoId(url)`
Estrae l'ID del video da un URL.

```javascript
extractVideoId(url) {
    const match = url.match(/\/video\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}
```

## 📝 Esempio Completo

Ecco un esempio completo di un plugin per una piattaforma immaginaria:

```javascript
const PluginBase = require('./plugin-base');
const axios = require('axios');

class MyVideoPlugin extends PluginBase {
    constructor() {
        super();
        this.apiBase = 'https://api.myvideo.com/v1';
    }

    getName() {
        return 'myvideo';
    }

    getDisplayName() {
        return 'My Video Platform';
    }

    getConfigSchema() {
        return {
            apiKey: { 
                type: 'string', 
                required: true, 
                label: 'API Key',
                description: 'La tua API key per My Video Platform'
            },
            maxResults: { 
                type: 'number', 
                required: false, 
                label: 'Risultati Massimi',
                min: 10,
                max: 100,
                default: 25
            }
        };
    }

    getCatalogs(config) {
        return [
            {
                id: 'search',
                name: 'Ricerca Video',
                extra: [
                    { name: 'search', isRequired: true, options: [''] }
                ]
            },
            {
                id: 'trending',
                name: 'Video in Tendenza'
            }
        ];
    }

    async search(query, config, limit = 25) {
        if (!config.apiKey) {
            throw new Error('API Key richiesta');
        }

        try {
            const response = await axios.get(`${this.apiBase}/search`, {
                params: {
                    q: query,
                    limit: Math.min(config.maxResults || 25, limit),
                    api_key: config.apiKey
                }
            });

            return response.data.results.map(item => this.formatVideoItem(item));
        } catch (error) {
            throw new Error(`Ricerca fallita: ${error.message}`);
        }
    }

    async getChannels(config, filter = null) {
        // Implementazione per canali seguiti
        return [];
    }

    async getVideoMeta(videoId, config) {
        if (!config.apiKey) {
            throw new Error('API Key richiesta');
        }

        try {
            const response = await axios.get(`${this.apiBase}/videos/${videoId}`, {
                params: { api_key: config.apiKey }
            });

            const video = response.data;
            return {
                id: video.id,
                title: this.sanitizeString(video.title),
                description: this.sanitizeString(video.description),
                thumbnail: video.thumbnail_url,
                duration: this.formatDuration(video.duration_seconds),
                channelTitle: video.channel_name,
                publishedAt: video.upload_date,
                viewCount: video.view_count
            };
        } catch (error) {
            throw new Error(`Impossibile recuperare metadati: ${error.message}`);
        }
    }

    async getVideoUrl(videoId, config) {
        if (!config.apiKey) {
            throw new Error('API Key richiesta');
        }

        try {
            const response = await axios.get(`${this.apiBase}/videos/${videoId}/stream`, {
                params: { api_key: config.apiKey }
            });

            return response.data.stream_url;
        } catch (error) {
            throw new Error(`Impossibile recuperare URL video: ${error.message}`);
        }
    }

    isVideoSupported(url) {
        return url.includes('myvideo.com');
    }

    extractVideoId(url) {
        const match = url.match(/\/video\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    formatVideoItem(item) {
        return {
            id: item.id,
            title: this.sanitizeString(item.title),
            description: this.sanitizeString(item.description),
            thumbnail: item.thumbnail_url,
            channelTitle: item.channel_name,
            publishedAt: item.upload_date,
            viewCount: item.view_count,
            duration: this.formatDuration(item.duration_seconds)
        };
    }
}

module.exports = MyVideoPlugin;
```

## 🚀 Installazione e Test

### 1. Crea il file del plugin
Salva il tuo plugin in `src/plugins/` con estensione `.js`.

### 2. Registra il plugin
Il plugin viene automaticamente rilevato dal `PluginManager`.

### 3. Testa il plugin
```bash
# Riavvia il server
pkill -f "node src/gateway.js"
node src/gateway.js

# Testa l'endpoint
curl "http://localhost:3100/api/plugins"
```

## 💡 Best Practices

### Gestione Errori
- Usa sempre `try/catch` per le chiamate API
- Fornisci messaggi di errore chiari e utili
- Gestisci i casi limite (API key mancante, quota esaurita, ecc.)

### Performance
- Implementa caching quando possibile
- Limita il numero di risultati per default
- Usa `Promise.all()` per chiamate parallele

### Sicurezza
- Sanitizza sempre le stringhe con `this.sanitizeString()`
- Valida la configurazione con `this.validateConfig()`
- Non esporre informazioni sensibili nei log

### Compatibilità
- Restituisci sempre oggetti nel formato atteso
- Usa i metodi utility forniti da `PluginBase`
- Testa con diversi tipi di contenuto

## 🔍 Troubleshooting

### Plugin non rilevato
- Verifica che il file sia in `src/plugins/`
- Controlla la sintassi JavaScript
- Verifica che estenda correttamente `PluginBase`

### Errori di configurazione
- Usa `this.validateConfig()` per validare
- Verifica che tutti i campi richiesti siano presenti
- Controlla i tipi di campo

### Problemi di streaming
- Verifica che `getVideoUrl()` restituisca URL validi
- Controlla i log per errori API
- Testa l'URL direttamente nel browser

### Problemi di ricerca
- Verifica i parametri API
- Controlla i limiti di quota
- Testa con query semplici

## 📚 Risorse Utili

- **Plugin Base**: `src/plugins/plugin-base.js`
- **Plugin YouTube**: `src/plugins/youtube.js` (esempio completo)
- **Plugin Manager**: `src/plugin-manager.js`
- **Gateway**: `src/gateway.js`

## 🤝 Contributi

Per contribuire con nuovi plugin:

1. Crea il plugin seguendo questa guida
2. Testa completamente la funzionalità
3. Aggiungi documentazione appropriata
4. Crea una pull request

---

**Nota**: Questa guida si basa su OMG Rome v1.0.0. Per versioni più recenti, controlla la documentazione aggiornata.
