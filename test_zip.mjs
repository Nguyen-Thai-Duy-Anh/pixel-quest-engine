import archiver from 'archiver';
console.log(typeof archiver, archiver);
const archive = archiver('zip', { zlib: { level: 9 } });
