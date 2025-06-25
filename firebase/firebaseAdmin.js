// backend/firebase/firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('../secrets/firebase-key.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

module.exports = admin;
