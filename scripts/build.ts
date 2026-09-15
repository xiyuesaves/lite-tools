import { build, context, BuildOptions, Plugin } from "esbuild";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { basename, join, extname, dirname } from "node:path";
import { execSync } from "node:child_process";
import chokidar from "chokidar";
import * as sass from "sass";
import AdmZip from "adm-zip";

const isDev = process.argv.includes("--watch");
const isAlpha = process.argv.includes("--alpha");

const SCSS_SRC_DIR = "./src/renderer/scss";
const OUT_CSS_DIR = "./dist/css";
const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const BUILD_TIME_BANNER_RE = /^\/\/ Build time: .*\r?\n/;

function formatBuildTime(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function createBuildTimeBannerPlugin(): Plugin {
  return {
    name: "build-time-banner",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) return;

        const outfile = build.initialOptions.outfile;
        if (!outfile || extname(outfile) !== ".js" || !existsSync(outfile)) return;

        const code = readFileSync(outfile, "utf-8").replace(BUILD_TIME_BANNER_RE, "");
        writeFileSync(outfile, `// Build time: ${formatBuildTime()}\n${code}`, "utf-8");
      });
    },
  };
}

// 通用基础配置
const baseConfig: BuildOptions = {
  bundle: true,
  charset: "utf8",
  minify: !isDev,
  logLevel: "info",
  treeShaking: true,
  assetNames: "assets/[name]-[hash]",
  define: {
    __DEV__: isDev.toString(),
    __ALPHA__: isAlpha.toString(),
    __VERSION__: `"${packageJson.version}"`,
    __BUILD_DATE__: `"${new Date().toLocaleDateString("zh-CN", { hour12: false })}"`,
  },
  plugins: [createBuildTimeBannerPlugin()],
};

// 构建目标列表
const builds: { config: BuildOptions; watchHtml?: string }[] = [
  {
    // main
    config: {
      ...baseConfig,
      platform: "node",
      target: "node20",
      tsconfig: "src/main/tsconfig.json",
      format: "cjs",
      entryPoints: ["src/main/index.ts"],
      outfile: "dist/main/index.js",
      external: ["electron"],
    },
  },
  {
    // preload
    config: {
      ...baseConfig,
      platform: "node",
      target: "node20",
      tsconfig: "src/preload/tsconfig.json",
      format: "cjs",
      entryPoints: ["src/preload/index.ts"],
      outfile: "dist/preload/index.js",
      external: ["electron"],
    },
  },
  {
    // renderer-qwq
    config: {
      ...baseConfig,
      platform: "browser",
      target: "es2022",
      format: "cjs",
      tsconfig: "src/renderer/tsconfig.json",
      entryPoints: ["src/renderer/index.qwq.ts"],
      outfile: "dist/renderer/index.qwq.js",
      loader: { ".html": "file", ".svg": "file" },
    },
  },
  {
    // renderer-ll
    config: {
      ...baseConfig,
      platform: "browser",
      target: "es2022",
      format: "esm",
      tsconfig: "src/renderer/tsconfig.json",
      entryPoints: ["src/renderer/index.ll.ts"],
      outfile: "dist/renderer/index.ll.js",
      loader: { ".html": "file", ".svg": "file" },
    },
  },
  {
    // preload-recallMsgViewer
    config: {
      ...baseConfig,
      platform: "node",
      target: "node20",
      format: "cjs",
      tsconfig: "src/renderer/tsconfig.json",
      entryPoints: ["src/preload/recallMsgViewer.ts"],
      outfile: "dist/preload/recallMsgViewer.js",
      external: ["electron"],
    },
  },
  {
    // renderer-recallMsgViewer
    config: {
      ...baseConfig,
      platform: "browser",
      target: "es2022",
      format: "iife",
      tsconfig: "src/renderer/tsconfig.json",
      entryPoints: ["src/renderer/pages/recallMsgViewer.ts"],
      outfile: "dist/renderer/pages/recallMsgViewer/index.js",
      loader: { ".html": "file" },
    },
    watchHtml: "src/assets/html/recallMsgViewer/index.html",
  },
  {
    // renderer-devWindow
    config: {
      ...baseConfig,
      platform: "browser",
      target: "esnext",
      format: "iife",
      tsconfig: "src/renderer/tsconfig.json",
      entryPoints: ["src/renderer/pages/devWindow.ts"],
      outfile: "dist/renderer/pages/devWindow/index.js",
      loader: { ".html": "file" },
    },
    watchHtml: "src/assets/html/devWindow/index.html",
  },
];

// 构建 HTML 的辅助函数
function processHtml(srcPath: string, outPath: string) {
  const html = readFileSync(srcPath, "utf-8");
  const newHtml = html.replace(
    /<script\b([^>]*?)\bsrc=["']([^"']+?)\.ts["']([^>]*)><\/script>/g,
    (_, beforeSrc, srcPath, afterSrc) => `<script${beforeSrc} src="${srcPath}.js"${afterSrc}></script>`,
  );
  writeFileSync(outPath, newHtml, "utf-8");
}

// 编译单个 SCSS 文件
function compileScssFile(srcFile: string, outDir: string) {
  const result = sass.compile(srcFile, { style: "expanded" });
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, basename(srcFile, ".scss") + ".css");
  writeFileSync(outFile, result.css, "utf-8");
  console.log(`[SCSS] ${basename(srcFile)} → ${basename(outFile)}`);
}

// 批量编译 SCSS
function compileAllScss() {
  const files = readdirSync(SCSS_SRC_DIR).filter((f) => extname(f) === ".scss");
  files.forEach((file) => compileScssFile(join(SCSS_SRC_DIR, file), OUT_CSS_DIR));
}

// watch SCSS 文件变化
function watchScss() {
  chokidar
    .watch(SCSS_SRC_DIR, {
      ignoreInitial: true,
      ignored: (path, stats) => {
        return !!(stats?.isFile() && !path.endsWith(".scss"));
      },
    })
    .on("all", (event, filePath) => {
      const cssFile = join(OUT_CSS_DIR, basename(filePath, ".scss") + ".css");
      if (event === "unlink") {
        if (existsSync(cssFile)) {
          unlinkSync(cssFile);
          console.log(`[SCSS] Deleted ${cssFile}`);
        }
      } else if (extname(filePath) === ".scss") {
        compileScssFile(filePath, OUT_CSS_DIR);
      }
    });
}

// 批量构建
async function runBuild() {
  if (isDev) {
    console.log("Starting development build...");
    compileAllScss();
    watchScss();
    const contexts = await Promise.all(
      builds.map(async ({ config, watchHtml }) => {
        const ctx = await context(config);
        await ctx.watch();

        if (watchHtml) {
          if (!existsSync(dirname(config.outfile!))) mkdirSync(dirname(config.outfile!), { recursive: true });
          chokidar
            .watch(watchHtml, { persistent: true, ignoreInitial: true })
            .on("all", () => processHtml(watchHtml, config.outfile!.replace(/\.js$/, ".html")));
          processHtml(watchHtml, config.outfile!.replace(/\.js$/, ".html"));
        }

        return ctx;
      }),
    );

    console.log("Development build started. Watching for changes...");
    return contexts;
  } else {
    try {
      const version = getVersionTag();
      console.log(`Starting build ${isAlpha ? "alpha" : "release"} version: ${version}`);
      compileAllScss();
      await Promise.all(
        builds.map(async ({ config, watchHtml }) => {
          // 改写为构建版本号
          config.define!.__VERSION__ = `"v${version}"`;

          await build(config);
          if (watchHtml) processHtml(watchHtml, config.outfile!.replace(/\.js$/, ".html"));
        }),
      );
      const zip = new AdmZip();
      zip.addLocalFolder("dist/css", "dist/css");
      zip.addLocalFolder("dist/main", "dist/main");
      zip.addLocalFolder("dist/preload", "dist/preload");
      zip.addLocalFolder("dist/renderer", "dist/renderer");
      zip.addLocalFolder("resources", "resources");
      zip.addFile("package.json", setJsonVersion("package.json", version));
      zip.addFile("manifest.json", setJsonVersion("manifest.json", version));
      zip.addLocalFile("LICENSE");
      // zip.addLocalFile("README.md");
      zip.writeZip(`dist/lite-tools v${version}.zip`);
      console.log("Build completed successfully.");
    } catch (err) {
      console.error("Error during production build:", err);
      process.exit(1);
    }
  }
}

function getVersionTag() {
  try {
    const tag = execSync("git describe --tags --exact-match", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .replace(/^v/, "");
    if (!/^v?\d+\.\d+\.\d+/.test(tag)) {
      throw new Error("Invalid version tag");
    }
    return tag;
  } catch {
    throw new Error("Not found version tag");
  }
}

function setJsonVersion(filePath: string, version: string) {
  const json = JSON.parse(readFileSync(filePath, "utf-8"));
  json.version = version;
  return Buffer.from(JSON.stringify(json, null, 2), "utf8");
}

runBuild().catch((err) => {
  console.error("Unhandled error in build script:", err);
  process.exit(1);
});
