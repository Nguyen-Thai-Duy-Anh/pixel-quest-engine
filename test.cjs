const http = require('http');

const data = JSON.stringify({
  rooms: {},
  tiles: {},
  sprites: {}
});

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/export',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', body.substring(0, 500)));
  }
);

req.on('error', console.error);
req.write(data);
req.end();
