const _origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, options) {
    if (type === '2d') {
        options = Object.assign({ willReadFrequently: true }, options || {});
    }
    return _origGetContext.call(this, type, options);
};

const GIF = window.GIF;

const uploader = document.getElementById('uploader');
const convertBtn = document.getElementById('convertBtn');
const downloads = document.getElementById('downloads');
const loading = document.getElementById('loading');
const widthInput = document.getElementById('widthInput');
const fpsInput = document.getElementById('fpsInput');

convertBtn.addEventListener('click', async () => {
    const files = Array.from(uploader.files);
    if (files.length === 0) return;

    // 二重クリック防止＋ローディング表示
    convertBtn.disabled = true;
    loading.hidden = false;
    downloads.innerHTML = '';

    for (const file of files) {
        try {
            const blob = await convertVideoToGif(file, {
                width: Number(widthInput.value),
                fps: Number(fpsInput.value),
                workerScript: chrome.runtime.getURL('assets/gifjs/gif.worker.js')
            });

            const url = URL.createObjectURL(blob);
            chrome.downloads.download({
                url,
                filename: file.name.replace(/\.[^.]+$/, '.gif'),
                saveAs: false
            });
        } catch (e) {
            console.error(`変換失敗: ${file.name}`, e);
        }
    }

    // 終了処理
    loading.hidden = true;
    convertBtn.disabled = false;
});

async function convertVideoToGif(file, opts) {
    const { width, fps, workerScript } = opts;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));

    // キャンバス準備
    const scale = width / video.videoWidth;
    const height = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: workerScript
    });

    const frameDelay = 1000 / fps;
    const totalFrames = Math.ceil(video.duration * fps);

    for (let i = 0; i < totalFrames; i++) {
        const t = Math.min(video.duration, i / fps);
        await seekVideo(video, t);
        ctx.drawImage(video, 0, 0, width, height);
        // ❗️ ここを ctx ではなく canvas に戻します
        gif.addFrame(canvas, { copy: true, delay: frameDelay });
    }

    const blob = await new Promise(resolve => {
        gif.on('finished', resolve);
        gif.render();
    });

    URL.revokeObjectURL(url);
    return blob;
}

function seekVideo(video, time) {
    return new Promise(resolve => {
        const handler = () => {
            video.removeEventListener('seeked', handler);
            resolve();
        };
        video.addEventListener('seeked', handler);
        video.currentTime = time;
    });
}