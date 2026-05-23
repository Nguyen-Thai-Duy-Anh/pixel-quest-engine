import express from "express";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Make sure we can parse large JSON bodies
  app.use(express.json({ limit: "50mb" }));

  app.get("/api/die", (req, res) => {
    res.send("Dying...");
    process.exit(1);
  });

  // Export game route
  app.post("/api/export", async (req, res) => {
    try {
      const { rooms, tiles, sprites } = req.body;
      const exportData = JSON.stringify({ rooms, tiles, sprites });

      // Run a production build if not already built (or safely force rebuild to ensure latest changes)
      console.log("Running vite build for export...");
      try {
        execSync("npm run build_client", { stdio: "ignore" });
      } catch(e) {
        console.log("build failed", e);
      }

      // Read the built index.html
      const indexPath = path.resolve(process.cwd(), "dist/client/index.html");
      let indexHtml = fs.readFileSync(indexPath, "utf-8");

      // Inject the JSON data
      const scriptInjection = `<script>window.__EXPORT_DATA__ = ${exportData};</script>`;
      indexHtml = indexHtml.replace("</head>", `${scriptInjection}\n</head>`);

      // Write it back
      fs.writeFileSync(indexPath, indexHtml);

      // Create ZIP
      const zip = new AdmZip();
      zip.addLocalFolder(path.resolve(process.cwd(), "dist/client"));
      
      const zipBuffer = zip.toBuffer();

      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename=my_game.zip');
      res.set('Content-Length', zipBuffer.length.toString());
      res.send(zipBuffer);

      console.log("Export complete!");
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: String(err), stack: err.stack });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist/client");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
