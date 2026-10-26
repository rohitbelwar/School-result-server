'use strict';
// Creates/resets an OMR administrator without starting a second HTTP server.
// Usage: npm run omr:create-admin -- <username>
require('dotenv').config();
const username = process.argv[2] || '';
process.argv[3] = username; // backend createAdmin() expects the username at argv[3]
const omr = require('../OMR-AutoChecker/backend/server.js');
omr.createAdmin();
