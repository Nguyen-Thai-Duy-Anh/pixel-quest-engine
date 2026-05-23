const http = require('http');
http.get('http://localhost:3000/api/die', res => res.on('data', d => console.log(d.toString()))).on('error', console.error);
