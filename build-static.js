const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('==> Building portals for Render deployment...');

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
  // Build student portal (default primary static site)
  console.log('==> Installing student dependencies & compiling...');
  execSync('npm --prefix student install', { stdio: 'inherit' });
  execSync('npm --prefix student run build', { stdio: 'inherit' });

  const studentDist = path.join(__dirname, 'student', 'dist');
  const rootBuild = path.join(__dirname, 'build');
  const rootDist = path.join(__dirname, 'dist');

  if (fs.existsSync(studentDist)) {
    console.log('==> Copying student/dist to root /build and /dist for Render compatibility...');
    copyRecursiveSync(studentDist, rootBuild);
    copyRecursiveSync(studentDist, rootDist);
    console.log('==> Build completed successfully! /build and /dist are ready.');
  }
} catch (error) {
  console.error('==> Build script error:', error);
  process.exit(1);
}
