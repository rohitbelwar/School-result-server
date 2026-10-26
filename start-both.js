'use strict';
// Legacy compatibility: OMR APIs now run inside server1.js, so only one server is needed.
console.log('OMR Auto-Checker is integrated into server1.js. Starting the unified server...');
require('child_process').spawn(process.execPath, ['server1.js'], { stdio: 'inherit', shell: false });
