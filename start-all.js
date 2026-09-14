const { spawn } = require('child_process');

console.log('========================================================================');
console.log(' AI-Based Adaptive Online Assessment & Smart Proctoring System');
console.log('========================================================================');
console.log('  🚀 Backend API:      http://127.0.0.1:8000 (Swagger: /docs)');
console.log('  👨‍🎓 Student Portal:  http://localhost:3000 (cd student && npm run dev)');
console.log('  👩‍🏫 Teacher Portal:  http://localhost:3001 (cd teacher && npm run dev)');
console.log('  🧑‍💼 Admin Portal:    http://localhost:3002 (cd admin && npm run dev)');
console.log('========================================================================\n');

const backend = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

const student = spawn('npm', ['--prefix', 'student', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

const teacher = spawn('npm', ['--prefix', 'teacher', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

const admin = spawn('npm', ['--prefix', 'admin', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

const cleanup = () => {
  console.log('\nShutting down all proctoring services...');
  backend.kill();
  student.kill();
  teacher.kill();
  admin.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
