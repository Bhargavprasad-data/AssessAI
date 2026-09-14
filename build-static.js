const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const portal = (process.env.PORTAL || process.env.VITE_PORTAL || 'student').toLowerCase();
console.log(`==> Building target portal [${portal}] for Render deployment...`);

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

try {
  let targetDir = 'student';
  if (portal.includes('teach')) {
    targetDir = 'teacher';
  } else if (portal.includes('admin')) {
    targetDir = 'admin';
  }

  console.log(`==> Installing dependencies & compiling [${targetDir}] portal...`);
  execSync(`npm --prefix ${targetDir} install`, { stdio: 'inherit' });
  execSync(`npm --prefix ${targetDir} run build`, { stdio: 'inherit' });

  const targetDist = path.join(__dirname, targetDir, 'dist');
  const rootBuild = path.join(__dirname, 'build');
  const rootDist = path.join(__dirname, 'dist');

  if (fs.existsSync(targetDist)) {
    console.log(`==> Copying ${targetDir}/dist to root /build and /dist for Render compatibility...`);
    // Clean old output directories
    if (fs.existsSync(rootBuild)) fs.rmSync(rootBuild, { recursive: true, force: true });
    if (fs.existsSync(rootDist)) fs.rmSync(rootDist, { recursive: true, force: true });

    copyRecursiveSync(targetDist, rootBuild);
    copyRecursiveSync(targetDist, rootDist);
    console.log(`==> ${targetDir} portal build completed successfully! /build and /dist are ready.`);
  }
} catch (error) {
  console.error('==> Build script error:', error);
  process.exit(1);
}
