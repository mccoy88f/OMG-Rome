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
        console.log(`        Initializing yt-dlp for: ${videoUrl}`);
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const ytDlp = spawn('yt-dlp', [
                '-f', 'bestvideo+bestaudio/best',
                '-o', '-',
                '--no-playlist',
                '--no-cache-dir',
                '--buffer-size', '64K',
                '--http-chunk-size', '10M',
                '--retries', '3',
                '--fragment-retries', '3',
                '--socket-timeout', '90', // Increased timeout
                '--retry-sleep', '2',
                '--merge-output-format', 'mp4',
                '--extractor-args', 'youtube:player_client=android',
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
}

module.exports = StreamingService;
