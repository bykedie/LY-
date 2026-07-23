import fs from 'node:fs';
import path from 'node:path';

export function serveStaticFile(requestPath, response, options) {
  const publicDir = options.publicDir;
  const statSync = options.statSync || fs.statSync;
  const createReadStream = options.createReadStream || fs.createReadStream;
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!isInsideDirectory(publicDir, filePath)) {
    sendText(response, 403, 'Forbidden');
    return Promise.resolve();
  }

  try {
    if (!statSync(filePath).isFile()) {
      sendText(response, 404, 'Not found');
      return Promise.resolve();
    }
  } catch (error) {
    sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let stream;
    try {
      stream = createReadStream(filePath);
    } catch (error) {
      sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
      resolve();
      return;
    }
    let opened = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    stream.once('open', () => {
      opened = true;
      response.writeHead(200, {
        'Content-Type': contentType(filePath),
        'Cache-Control': 'no-store'
      });
      stream.pipe(response);
    });
    stream.once('error', (error) => {
      if (!opened && !response.headersSent) {
        sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
      } else if (!response.writableEnded) {
        response.destroy(error);
      }
      finish();
    });
    stream.once('end', finish);
    response.once?.('close', finish);
  });
}

function isInsideDirectory(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function contentType(filePath) {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
  };
  return contentTypes[path.extname(filePath)] || 'application/octet-stream';
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(body);
}
