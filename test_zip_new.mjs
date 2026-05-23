import { ZipArchive } from 'archiver';
try {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  console.log("Success creating ZipArchive");
} catch(e) {
  console.error("Error! " + e.stack);
}
