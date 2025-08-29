const { spawn } = require('child_process');

class StreamingService {
    async createFastStream(videoUrl) {
        console.log(`Initializing fast stream (pre-merged) for: ${videoUrl}`);
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const ytDlp = spawn('yt-dlp', [
                '-f', 'best[height<=720]/best',
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
            let initTimeout = setTimeout(() => {
                if (!streamReady) {
                    console.error('Fast stream timeout after 10 seconds');
                    ytDlp.kill('SIGKILL');
                    reject(new Error('Fast stream timeout'));
                }
            }, 10000);

            ytDlp.stdout.on('data', (chunk) => {
                if (!streamReady) {
                    streamReady = true;
                    clearTimeout(initTimeout);
                    const initTime = Date.now() - startTime;
                    console.log(`Fast start: First data in ${initTime}ms`);
                    resolve(ytDlp.stdout);
                }
                totalBytes += chunk.length;
            });

            ytDlp.stderr.on('data', (data) => {
                const stderrText = data.toString();
                if (stderrText.includes('ERROR')) {
                    console.error('Fast stream error:', stderrText.trim());
                    if (!streamReady) {
                        clearTimeout(initTimeout);
                        reject(new Error(stderrText.trim()));
                    }
                }
            });

            ytDlp.on('error', (error) => {
                clearTimeout(initTimeout);
                if (!streamReady) reject(error);
            });

            ytDlp.on('exit', (code) => {
                clearTimeout(initTimeout);
                if (!streamReady && code !== 0) {
                    reject(new Error(`Fast stream failed with code ${code}`));
                }
            });
        });
    }

    async createStream(videoUrl) {
        console.log(`Initializing yt-dlp merge for: ${videoUrl}`);
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const ytDlp = spawn('yt-dlp', [
                '-f', 'bestvideo+bestaudio/best',
                '-o', '-',
                '--no-playlist',
                '--no-cache-dir',
                '--merge-output-format', 'mp4',
                '--extractor-args', 'youtube:player_client=android',
                '--no-check-certificates',
                videoUrl
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let streamReady = false;
            let initTimeout = setTimeout(() => {
                if (!streamReady) {
                    console.error('Stream timeout after 30 seconds');
                    ytDlp.kill('SIGKILL');
                    reject(new Error('Stream initialization timeout'));
                }
            }, 30000);

            ytDlp.stdout.on('data', (chunk) => {
                if (!streamReady) {
                    streamReady = true;
                    clearTimeout(initTimeout);
                    console.log(`Merge completed after ${Date.now() - startTime}ms`);
                    resolve(ytDlp.stdout);
                }
            });

            ytDlp.stderr.on('data', (data) => {
                const stderrText = data.toString();
                if (stderrText.includes('ERROR')) {
                    console.error('Stream error:', stderrText.trim());
                    if (!streamReady) {
                        clearTimeout(initTimeout);
                        reject(new Error(stderrText.trim()));
                    }
                }
            });

            ytDlp.on('error', (error) => {
                clearTimeout(initTimeout);
                if (!streamReady) reject(error);
            });

            ytDlp.on('exit', (code) => {
                clearTimeout(initTimeout);
                if (!streamReady && code !== 0) {
                    reject(new Error(`Stream failed with code ${code}`));
                }
            });
        });
    }

    async checkYtDlpAvailable() {
        return new Promise((resolve) => {
            const ytDlp = spawn('yt-dlp', ['--version']);
            ytDlp.on('error', () => resolve(false));
            ytDlp.on('close', (code) => resolve(code === 0));
            setTimeout(() => { ytDlp.kill(); resolve(false); }, 5000);
        });
    }
}

module.exports = StreamingService;
