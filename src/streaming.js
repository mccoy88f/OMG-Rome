const { spawn } = require('child_process');

class StreamingService {
    constructor() {
        // Cache per evitare processi multipli per lo stesso video
        this.activeStreams = new Map();
    }
    async createFastStream(videoUrl) {
        console.log(`        Initializing fast stream (pre-merged) for: ${videoUrl}`);
        
        try {
            // Ottieni URL diretto per streaming rapido (solo MP4 pre-mergeati)
            const directUrl = await this.createFastStreamUrl(videoUrl);
            console.log(`        Fast stream URL diretto ottenuto: ${directUrl}`);
            
            // Per il flusso rapido, restituisci sempre l'URL diretto
            // Non facciamo merge, non generiamo HLS, mai yt-dlp
            const { Readable } = require('stream');
            const stream = new Readable();
            stream.push(`# Direct MP4 Stream
# URL: ${directUrl}
# Format: Pre-merged MP4 (no ffmpeg required)
# Quality: Fast (720p max)
# No yt-dlp streaming - direct URL only`);
            stream.push(null);
            return stream;
            
        } catch (error) {
            console.log(`        Fast URL failed: ${error.message}`);
            // NON facciamo fallback a yt-dlp per il flusso rapido
            // Restituiamo un errore invece di avviare processi
            throw new Error(`Fast stream failed - no direct URL available: ${error.message}`);
        }
    }

    /**
     * Crea uno stream rapido usando yt-dlp (fallback)
     * @param {string} videoUrl - URL del video YouTube
     * @returns {Promise<Readable>} Stream leggibile
     */
    async createFastStreamDirect(videoUrl) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const ytDlp = spawn('yt-dlp', [
                '-f', 'best[height<=720]/best', // Formati già ricomposti, max 720p
                '-o', '-',
                '--no-playlist',
                '--no-cache-dir',
                '--buffer-size', '32K',
                '--http-chunk-size', '2M', // Ridotto per streaming come versione vecchia
                '--retries', '3',
                '--socket-timeout', '30',
                '--extractor-args', 'youtube:player_client=android', // Solo android come versione vecchia
                '--extractor-args', 'youtube:formats=missing_pot', // CHIAVE: abilita formati senza PO token
                '--no-check-certificates',
                '--recode-video', 'mp4', // CHIAVE: forza ricodifica MP4 compatibile
                videoUrl
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let totalBytes = 0;
            let streamReady = false;
            let initTimeout = null;
            const INIT_TIMEOUT = 25000; // 25 seconds max for pre-merged (aumentato da 10s)

            initTimeout = setTimeout(() => {
                if (!streamReady) {
                    console.error(`        FAST STREAM TIMEOUT after 25 seconds`);
                    ytDlp.kill('SIGKILL');
                    reject(new Error('Fast stream initialization timeout'));
                }
            }, INIT_TIMEOUT);

            ytDlp.stdout.on('data', (chunk) => {
                if (!streamReady) {
                    streamReady = true;
                    clearTimeout(initTimeout);
                    const initTime = Date.now() - startTime;
                    console.log(`        FAST START: First data in ${initTime}ms (no merge required)`);
                    resolve(ytDlp.stdout);
                }
                
                totalBytes += chunk.length;
                if (totalBytes % (5 * 1024 * 1024) === 0) { // Log every 5MB
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = totalBytes / elapsed / 1024 / 1024;
                    console.log(`        Fast stream: ${(totalBytes / 1024 / 1024).toFixed(1)}MB (${speed.toFixed(1)}MB/s)`);
                }
            });

            ytDlp.stderr.on('data', (data) => {
                const stderrText = data.toString();
                
                if (stderrText.includes('ERROR') || stderrText.includes('CRITICAL')) {
                    console.error(`        Fast stream ERROR: ${stderrText.trim()}`);
                    if (!streamReady) {
                        clearTimeout(initTimeout);
                        reject(new Error(`Fast stream error: ${stderrText.trim()}`));
                    }
                } else if (stderrText.includes('[youtube]')) {
                    console.log(`        Fast: ${stderrText.trim()}`);
                }
            });

            ytDlp.on('error', (error) => {
                console.error(`        Fast stream process error: ${error.message}`);
                clearTimeout(initTimeout);
                if (!streamReady) {
                    reject(error);
                }
            });

            ytDlp.on('exit', (code, signal) => {
                clearTimeout(initTimeout);
                const finalTime = Date.now() - startTime;
                
                if (code === 0) {
                    console.log(`        Fast stream completed after ${finalTime}ms`);
                } else {
                    console.error(`        Fast stream exited: code ${code}, signal ${signal}`);
                    if (!streamReady) {
                        reject(new Error(`Fast stream failed with code ${code}`));
                    }
                }
            });
        });
    }

    async createStream(videoUrl) {
        console.log(`        Initializing yt-dlp for: ${videoUrl}`);
        
        // Controlla se esiste già uno stream attivo per questo video
        if (this.activeStreams.has(videoUrl)) {
            console.log(`        Reusing existing stream for: ${videoUrl}`);
            return this.activeStreams.get(videoUrl);
        }
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const ytDlp = spawn('yt-dlp', [
                '-f', 'bestvideo+bestaudio/best', // Manteniamo bestvideo+bestaudio per il merge
                '-o', '-',
                '--no-playlist',
                '--no-cache-dir',
                '--buffer-size', '64K',
                '--http-chunk-size', '2M', // Ridotto per streaming come versione vecchia
                '--retries', '5', // Aumentato come versione vecchia
                '--fragment-retries', '5',
                '--socket-timeout', '60', // Aumentato come versione vecchia
                '--retry-sleep', '1',
                '--merge-output-format', 'mp4', // CHIAVE: forza ricodifica MP4 compatibile
                '--recode-video', 'mp4', // CHIAVE: forza ricodifica MP4 compatibile
                '--extractor-args', 'youtube:player_client=android', // Solo android come versione vecchia
                '--extractor-args', 'youtube:formats=missing_pot', // CHIAVE: abilita formati senza PO token
                '--no-check-certificates',
                '--hls-prefer-native',
                '--prefer-ffmpeg',
                videoUrl
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let totalBytes = 0;
            let streamReady = false;
            let initTimeout = null;
            const INIT_TIMEOUT = 30000; // 30 seconds for initialization

            // Extended timeout for initialization
            initTimeout = setTimeout(() => {
                if (!streamReady) {
                    console.error(`        TIMEOUT: yt-dlp failed to initialize after 30 seconds`);
                    console.error(`        This may indicate:`);
                    console.error(`        - Video is geo-restricted`);
                    console.error(`        - Network issues`);
                    console.error(`        - YouTube protection measures`);
                    ytDlp.kill('SIGKILL');
                    reject(new Error('Stream initialization timeout after 30 seconds'));
                }
            }, INIT_TIMEOUT);

            ytDlp.stdout.on('data', (chunk) => {
                if (!streamReady) {
                    streamReady = true;
                    clearTimeout(initTimeout);
                    const initTime = Date.now() - startTime;
                    console.log(`        SUCCESS: First data received after ${initTime}ms`);
                    console.log(`        ffmpeg merge completed, streaming to client...`);
                    
                    // Salva lo stream nella cache
                    this.activeStreams.set(videoUrl, ytDlp.stdout);
                    
                    resolve(ytDlp.stdout);
                }
                
                totalBytes += chunk.length;
                if (totalBytes % (10 * 1024 * 1024) === 0) { // Log every 10MB
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = totalBytes / elapsed / 1024 / 1024;
                    console.log(`        Progress: ${(totalBytes / 1024 / 1024).toFixed(1)}MB transferred (${speed.toFixed(1)}MB/s)`);
                }
            });

            ytDlp.stderr.on('data', (data) => {
                const stderrText = data.toString();
                
                if (stderrText.includes('ERROR') || stderrText.includes('CRITICAL')) {
                    console.error(`        yt-dlp ERROR: ${stderrText.trim()}`);
                    if (!streamReady) {
                        clearTimeout(initTimeout);
                        reject(new Error(`yt-dlp error: ${stderrText.trim()}`));
                    }
                } else if (stderrText.includes('WARNING') && !stderrText.includes('PO Token')) {
                    if (stderrText.includes('ffmpeg')) {
                        console.warn(`        ffmpeg warning: ${stderrText.trim()}`);
                    }
                } else if (stderrText.includes('[youtube]') || stderrText.includes('Extracting')) {
                    // Log extraction progress
                    console.log(`        ${stderrText.trim()}`);
                } else if (stderrText.includes('Merging formats')) {
                    console.log(`        ffmpeg: Starting video+audio merge...`);
                } else if (stderrText.includes('[ffmpeg]') && stderrText.includes('Merging')) {
                    console.log(`        ffmpeg: ${stderrText.trim()}`);
                }
            });

            ytDlp.on('error', (error) => {
                console.error(`        Process error: ${error.message}`);
                clearTimeout(initTimeout);
                if (!streamReady) {
                    reject(error);
                }
            });

            ytDlp.on('exit', (code, signal) => {
                clearTimeout(initTimeout);
                const finalTime = Date.now() - startTime;
                
                // Pulisci la cache quando lo stream è completato
                this.activeStreams.delete(videoUrl);
                
                if (code === 0) {
                    console.log(`        Stream completed successfully after ${finalTime}ms`);
                    console.log(`        Total data transferred: ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
                } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
                    console.log(`        Stream terminated by signal ${signal} after ${finalTime}ms`);
                    console.log(`        Data transferred before termination: ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
                } else {
                    console.error(`        yt-dlp exited with code ${code}, signal ${signal} after ${finalTime}ms`);
                    if (!streamReady) {
                        reject(new Error(`yt-dlp failed with code ${code}`));
                    }
                }
            });
        });
    }

    async getVideoInfo(videoUrl) {
        return new Promise((resolve, reject) => {
            const ytDlp = spawn('yt-dlp', [
                '--dump-json',
                '--no-playlist',
                '--no-cache-dir',
                '--socket-timeout', '30',
                '--quiet',
                videoUrl
            ]);

            let stdout = '';
            let stderr = '';

            ytDlp.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ytDlp.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ytDlp.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(stdout);
                        resolve(info);
                    } catch (error) {
                        reject(new Error(`JSON parsing error: ${error.message}`));
                    }
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });

            ytDlp.on('error', (error) => {
                reject(new Error(`yt-dlp execution error: ${error.message}`));
            });

            setTimeout(() => {
                ytDlp.kill();
                reject(new Error('Timeout getting video info'));
            }, 30000);
        });
    }

    async checkYtDlpAvailable() {
        return new Promise((resolve) => {
            const ytDlp = spawn('yt-dlp', ['--version']);
            
            ytDlp.on('error', () => resolve(false));
            ytDlp.on('close', (code) => resolve(code === 0));
            
            setTimeout(() => {
                ytDlp.kill();
                resolve(false);
            }, 5000);
        });
    }

    /**
     * Crea un URL diretto per streaming rapido (pre-mergeato)
     * @param {string} videoUrl - URL del video YouTube
     * @returns {Promise<string>} URL diretto per streaming
     */
    async createFastStreamUrl(videoUrl) {
        return new Promise((resolve, reject) => {
            console.log(`        Fast URL: Estrazione URL diretto per: ${videoUrl}`);
            
            const ytDlp = spawn('yt-dlp', [
                '-g', // Solo URL, non scaricare
                '-f', 'best[height<=720][protocol=m3u8_native]/best[height<=720]/best', // Prima HLS, poi MP4
                '--no-playlist',
                '--no-cache-dir',
                '--extractor-args', 'youtube:player_client=android,web,mweb', // Più client per più formati
                '--extractor-args', 'youtube:formats=missing_pot', // CHIAVE: abilita formati senza PO token
                '--no-check-certificates',
                videoUrl
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            ytDlp.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ytDlp.stderr.on('data', (data) => {
                const stderrText = data.toString();
                if (stderrText.includes('WARNING') && !stderrText.includes('PO Token')) {
                    console.log(`        Fast URL Warning: ${stderrText.trim()}`);
                }
            });

            ytDlp.on('close', (code) => {
                if (code === 0) {
                    const url = stdout.trim().split('\n')[0];
                    if (url && url.startsWith('http')) {
                        console.log(`        Fast URL SUCCESS: ${url}`);
                        resolve(url);
                    } else {
                        console.log(`        Fast URL ERROR: URL non valido: ${url}`);
                        reject(new Error('URL non valido estratto da yt-dlp'));
                    }
                } else {
                    console.log(`        Fast URL ERROR: yt-dlp fallito con codice ${code}`);
                    reject(new Error(`yt-dlp fallito con codice ${code}`));
                }
            });

            ytDlp.on('error', (error) => {
                console.error(`        Fast URL ERROR: ${error.message}`);
                reject(error);
            });

            // Timeout dopo 15 secondi
            setTimeout(() => {
                ytDlp.kill();
                console.log(`        Fast URL TIMEOUT after 15 seconds`);
                reject(new Error('Fast URL extraction timeout'));
            }, 15000);
        });
    }
}

module.exports = StreamingService;
