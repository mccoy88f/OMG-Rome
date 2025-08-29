const { spawn } = require('child_process');

class StreamingService {
    async createFastStream(videoUrl) {
        console.log(`        Initializing fast stream (pre-merged) for: ${videoUrl}`);
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const ytDlp = spawn('yt-dlp', [
                '-f', 'best[height<=720]/best', // Pre-merged format, no ffmpeg needed
                '-o', '-',
                '--no-playlist',
                '--no-cache-dir',
                '--buffer-size', '32K',
                '--http-chunk-size', '5M',
                '--retries', '2',
                '--socket-timeout', '30',
                '--extractor-args', 'youtube:player_client=android',
                '--no-check-certificates',
                videoUrl
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let totalBytes = 0;
            let streamReady = false;
            let initTimeout = null;
            const INIT_TIMEOUT = 10000; // 10 seconds max for pre-merged

            initTimeout = setTimeout(() => {
                if (!streamReady) {
                    console.error(`        FAST STREAM TIMEOUT after 10 seconds`);
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
        console.log(`Creating stream for: ${videoUrl}`);
        
        return new Promise((resolve, reject) => {
            const ytDlp = spawn('yt-dlp', [
                '-f', 'bestvideo+bestaudio/best',
                '-o', '-',
                '--no-playlist',
                '--no-cache-dir',
                '--buffer-size', '16K',
                '--http-chunk-size', '1M',
                '--retries', '3',
                '--fragment-retries', '3',
                '--socket-timeout', '30',
                '--retry-sleep', '2',
                '--merge-output-format', 'mp4',
                '--extractor-args', 'youtube:player_client=android',
                '--no-check-certificates',
                '--prefer-free-formats',
                videoUrl
            ]);

            let totalBytes = 0;
            const startTime = Date.now();

            ytDlp.stdout.on('data', (chunk) => {
                totalBytes += chunk.length;
                if (totalBytes % (1024 * 1024) === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = totalBytes / elapsed / 1024 / 1024;
                    console.log(`Stream: ${(totalBytes / 1024 / 1024).toFixed(1)}MB (${speed.toFixed(1)}MB/s)`);
                }
            });

            ytDlp.stderr.on('data', (data) => {
                const stderrText = data.toString();
                
                if (stderrText.includes('ERROR') || stderrText.includes('CRITICAL')) {
                    if (stderrText.includes('Broken pipe')) {
                        console.log('Client disconnected: Broken pipe');
                    } else if (stderrText.includes('HTTP Error 403')) {
                        console.log('Access denied: Video may be geo-restricted');
                    } else if (stderrText.includes('Video unavailable')) {
                        console.log('Video unavailable: Removed or private');
                    } else {
                        console.error('yt-dlp error:', stderrText.trim());
                    }
                }
            });

            ytDlp.on('error', (error) => {
                console.error('yt-dlp process error:', error.message);
                reject(error);
            });

            ytDlp.on('exit', (code, signal) => {
                if (code === 0) {
                    console.log(`Stream completed (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
                } else if (code === 120 && signal === null) {
                    console.log(`Client disconnected (${(totalBytes / 1024 / 1024).toFixed(1)}MB transferred)`);
                } else {
                    console.error(`yt-dlp exited with code ${code}, signal ${signal}`);
                }
            });

            resolve(ytDlp.stdout);
        });
    }

class StreamingService {
    constructor() {
        this.urlCache = new Map(); // videoId -> {url, extractedAt, expiresAt}
        this.CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 ore
    }

    async getDirectStreamUrl(videoUrl, videoId) {
        console.log(`Extracting direct URL for: ${videoUrl}`);
        
        // Check cache first
        if (this.urlCache.has(videoId)) {
            const cached = this.urlCache.get(videoId);
            const now = Date.now();
            
            if (now < cached.expiresAt) {
                console.log(`Using cached URL for ${videoId} (${Math.floor((cached.expiresAt - now) / 60000)}min remaining)`);
                return cached.url;
            } else {
                console.log(`Cached URL for ${videoId} expired, re-extracting`);
                this.urlCache.delete(videoId);
            }
        }
        
        return new Promise((resolve, reject) => {
            const ytDlp = spawn('yt-dlp', [
                '-f', 'bestvideo+bestaudio/best',
                '-g',
                '--no-playlist',
                '--extractor-args', 'youtube:player_client=android',
                '--no-check-certificates',
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
                    const urls = stdout.trim().split('\n').filter(url => url.startsWith('http'));
                    if (urls.length > 0) {
                        const url = urls[0];
                        const now = Date.now();
                        
                        // Cache the URL
                        this.urlCache.set(videoId, {
                            url: url,
                            extractedAt: now,
                            expiresAt: now + this.CACHE_DURATION
                        });
                        
                        console.log(`Direct URL extracted and cached for ${videoId}`);
                        resolve(url);
                    } else {
                        reject(new Error('No valid stream URL extracted'));
                    }
                } else {
                    console.error(`yt-dlp URL extraction failed: ${stderr}`);
                    reject(new Error(`URL extraction failed: ${stderr}`));
                }
            });

            ytDlp.on('error', (error) => {
                reject(error);
            });

            setTimeout(() => {
                ytDlp.kill();
                reject(new Error('URL extraction timeout'));
            }, 15000);
        });
    }

    async createStreamFromCachedUrl(videoUrl, videoId) {
        try {
            // Try to get fresh URL if not cached or expired
            const directUrl = await this.getDirectStreamUrl(videoUrl, videoId);
            
            // Create a redirect stream instead of proxying through yt-dlp
            console.log(`Using direct YouTube URL for streaming ${videoId}`);
            return { type: 'redirect', url: directUrl };
            
        } catch (error) {
            console.log(`Direct URL failed for ${videoId}, falling back to yt-dlp merge`);
            // Fallback to real-time merge
            return this.createStream(videoUrl);
        }
    }
        console.log(`Extracting direct URL for: ${videoUrl}`);
        
        return new Promise((resolve, reject) => {
            const ytDlp = spawn('yt-dlp', [
                '-f', 'best[height<=1080]/best', // Formato singolo con audio+video garantito
                '-g', // Get URL only, don't download
                '--no-playlist',
                '--extractor-args', 'youtube:player_client=android',
                '--no-check-certificates',
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
                    const urls = stdout.trim().split('\n').filter(url => url.startsWith('http'));
                    if (urls.length > 0) {
                        // Return first valid URL
                        console.log(`Direct URL extracted successfully`);
                        resolve(urls[0]);
                    } else {
                        console.error('No valid URL found in yt-dlp output');
                        reject(new Error('No valid stream URL extracted'));
                    }
                } else {
                    console.error(`yt-dlp URL extraction failed: ${stderr}`);
                    reject(new Error(`URL extraction failed: ${stderr}`));
                }
            });

            ytDlp.on('error', (error) => {
                console.error('yt-dlp URL extraction error:', error.message);
                reject(error);
            });

            // Timeout for URL extraction
            setTimeout(() => {
                ytDlp.kill();
                reject(new Error('URL extraction timeout'));
            }, 15000);
        });
    }
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
}

module.exports = StreamingService;
