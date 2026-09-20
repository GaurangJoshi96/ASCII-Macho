const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};

const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/' || reqUrl === '/index.html') {
        reqUrl = fs.existsSync(path.join(PUBLIC_DIR, 'ASCII Macho.html')) ? '/ASCII Macho.html' : '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, reqUrl);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${err.code}`);
            }
            return;
        }

        if (stats.isDirectory()) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Forbidden');
            return;
        }

        const range = req.headers.range;
        if (range && (ext === '.mp4' || ext === '.webm')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunkSize = (end - start) + 1;
            const stream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType
            });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': stats.size,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes'
            });
            fs.createReadStream(filePath).pipe(res);
        }
    });
});

server.listen(PORT, () => {
    console.log(`ASCIIArt Local Server running at http://localhost:${PORT}/`);
});
