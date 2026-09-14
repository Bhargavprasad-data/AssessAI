const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';
const venvPy = isWin 
  ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
  : path.join(__dirname, 'venv', 'bin', 'python');

const pythonBin = fs.existsSync(venvPy) ? venvPy : 'python';

console.log(`Starting FastAPI backend with: ${pythonBin}`);

const child = spawn(
  pythonBin,
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
  { stdio: 'inherit', shell: false }
);

child.on('exit', (code) => {
  process.exit(code || 0);
});
