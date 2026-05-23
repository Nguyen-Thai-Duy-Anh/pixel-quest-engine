var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_adm_zip = __toESM(require("adm-zip"), 1);
var import_child_process = require("child_process");
var import_vite = require("vite");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  app.get("/api/die", (req, res) => {
    res.send("Dying...");
    process.exit(1);
  });
  app.post("/api/export", async (req, res) => {
    try {
      const { rooms, tiles, sprites } = req.body;
      const exportData = JSON.stringify({ rooms, tiles, sprites });
      console.log("Running vite build for export...");
      try {
        (0, import_child_process.execSync)("npm run build_client", { stdio: "ignore" });
      } catch (e) {
        console.log("build failed", e);
      }
      const indexPath = import_path.default.resolve(process.cwd(), "dist/client/index.html");
      let indexHtml = import_fs.default.readFileSync(indexPath, "utf-8");
      const scriptInjection = `<script>window.__EXPORT_DATA__ = ${exportData};</script>`;
      indexHtml = indexHtml.replace("</head>", `${scriptInjection}
</head>`);
      import_fs.default.writeFileSync(indexPath, indexHtml);
      const zip = new import_adm_zip.default();
      zip.addLocalFolder(import_path.default.resolve(process.cwd(), "dist/client"));
      const zipBuffer = zip.toBuffer();
      res.set("Content-Type", "application/zip");
      res.set("Content-Disposition", "attachment; filename=my_game.zip");
      res.set("Content-Length", zipBuffer.length.toString());
      res.send(zipBuffer);
      console.log("Export complete!");
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: String(err), stack: err.stack });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist/client");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
