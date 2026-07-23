import { EventEmitter } from 'node:events';
import path from 'node:path';
import { serveStaticFile } from '../src/static-server.js';

const publicDir = path.resolve('public');
await expectSuccess();
await expectMissingFile();
await expectPermissionError();
await expectSynchronousOpenError();
await expectMidStreamError();
await expectDirectoryRejected();
expectTraversalRejected();
console.log('static server test ok');

async function expectSuccess() {
  const response = fakeResponse();
  const stream = fakeStream();
  const served = serveStaticFile('/app.js', response, {
    publicDir,
    statSync: () => ({ isFile: () => true }),
    createReadStream: () => stream
  });
  stream.emit('open');
  stream.emit('data', Buffer.from('hello'));
  stream.emit('end');
  await served;
  assert(response.statusCode === 200, '静态文件成功打开前后没有返回 200');
  assert(response.body === 'hello', '静态文件内容没有写入响应');
}

async function expectMissingFile() {
  const response = fakeResponse();
  const stream = fakeStream();
  const served = serveStaticFile('/gone.js', response, {
    publicDir,
    statSync: () => ({ isFile: () => true }),
    createReadStream: () => stream
  });
  stream.emit('error', Object.assign(new Error('gone'), { code: 'ENOENT' }));
  await served;
  assert(response.statusCode === 404 && response.body === 'Not found', '打开前文件消失没有返回 404');
}

async function expectPermissionError() {
  const response = fakeResponse();
  const stream = fakeStream();
  const served = serveStaticFile('/locked.js', response, {
    publicDir,
    statSync: () => ({ isFile: () => true }),
    createReadStream: () => stream
  });
  stream.emit('error', Object.assign(new Error('denied'), { code: 'EACCES' }));
  await served;
  assert(response.statusCode === 500 && response.body === 'Unable to read file', '静态文件权限错误没有安全返回 500');
}

async function expectSynchronousOpenError() {
  const response = fakeResponse();
  await serveStaticFile('/throw.js', response, {
    publicDir,
    statSync: () => ({ isFile: () => true }),
    createReadStream: () => { throw Object.assign(new Error('open failed'), { code: 'EACCES' }); }
  });
  assert(response.statusCode === 500, '同步创建读取流失败没有返回 500');
}

async function expectMidStreamError() {
  const response = fakeResponse();
  const stream = fakeStream();
  const served = serveStaticFile('/partial.js', response, {
    publicDir,
    statSync: () => ({ isFile: () => true }),
    createReadStream: () => stream
  });
  stream.emit('open');
  stream.emit('data', Buffer.from('partial'));
  stream.emit('error', new Error('disk failure'));
  await served;
  assert(response.statusCode === 200 && response.destroyed, '流中途失败没有销毁不完整响应');
}

async function expectDirectoryRejected() {
  const response = fakeResponse();
  await serveStaticFile('/assets', response, {
    publicDir,
    statSync: () => ({ isFile: () => false }),
    createReadStream: () => { throw new Error('目录不应创建读取流'); }
  });
  assert(response.statusCode === 404, '静态路径指向目录时没有返回 404');
}

function expectTraversalRejected() {
  const response = fakeResponse();
  return serveStaticFile('/../package.json', response, { publicDir }).then(() => {
    assert(response.statusCode === 403, '静态路径穿越没有返回 403');
  });
}

function fakeStream() {
  const stream = new EventEmitter();
  stream.pipe = (response) => {
    stream.on('data', (chunk) => response.write(chunk));
    stream.on('end', () => response.end());
    return response;
  };
  stream.destroy = () => {};
  return stream;
}

function fakeResponse() {
  return {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    statusCode: null,
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
    },
    write(chunk) { this.body += chunk.toString(); },
    end(chunk = '') { this.body += chunk.toString(); this.writableEnded = true; },
    destroy() { this.destroyed = true; }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
