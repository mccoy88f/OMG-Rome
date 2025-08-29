const { spawn } = require('child_process');

class StreamingService {
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
