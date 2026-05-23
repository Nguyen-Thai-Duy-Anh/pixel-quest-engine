import('archiver').then(archiver => {
  console.log("Keys:", Object.keys(archiver));
  console.log("create exists?", typeof archiver.create);
  console.log("Archiver exists?", typeof archiver.Archiver);
});
