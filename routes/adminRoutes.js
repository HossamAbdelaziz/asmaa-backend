const express = require('express');
const router = express.Router();
const sendFCMNotification = require('../utils/sendFCMNotification');
const admin = require('../firebase/firebaseAdmin');

// ✅ POST /api/admin/send-notification
router.post('/send-notification', async (req, res) => {
    const { userIds, title, body, imageUrl } = req.body;

    // 🔒 Basic validation
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
        return res.status(400).json({ error: 'Missing userIds, title, or body' });
    }

    try {
        const userTokens = [];         // 🔹 Collect all tokens across users
        const userTokenMap = {};       // 🔹 Map of uid → token objects

        // 🔁 Loop through users to collect their FCM tokens
        for (const uid of userIds) {
            const userDoc = await admin.firestore().collection('users').doc(uid).get();
            const fcmTokens = userDoc.data()?.messaging?.fcmTokens || [];

            if (fcmTokens.length > 0) {
                userTokens.push(...fcmTokens);       // tokens are objects { token, platform, ... }
                userTokenMap[uid] = fcmTokens;
            }
        }

        // 📋 Create delivery metadata for Firestore
        const delivery = userIds.map(uid => ({
            uid,
            seen: false,
            clicked: false,
            seenAt: null,
            clickedAt: null
        }));

        // 📝 Save the notification record to Firestore
        const notifRef = await admin.firestore().collection('notifications').add({
            title,
            body,
            imageUrl: imageUrl || null,
            type: 'manual',
            delivery,
            createdAt: new Date()
        });

        const results = []; // ✅ FIXED: Declare results array

        // 🚀 Send to each token (only the .token string)
        for (const tokenObj of userTokens) {
            const token = typeof tokenObj === 'string' ? tokenObj : tokenObj.token;

            console.log("📨 Sending to token:", token);
            console.log("📦 Payload:", {
                title,
                body,
                image: imageUrl,
                data: { notifId: notifRef.id }
            });

            const result = await sendFCMNotification({
                token,
                title,
                body,
                image: imageUrl,
                data: { notifId: notifRef.id }
            });

            results.push(result);
        }

        // 🧹 Identify invalid tokens (e.g., unregistered)
        const invalidTokensByUser = {};

        for (const result of results) {
            if (!result.success && result.errorCode === 'messaging/registration-token-not-registered') {
                for (const [uid, tokens] of Object.entries(userTokenMap)) {
                    const matched = tokens.find(t => t.token === result.token);
                    if (matched) {
                        if (!invalidTokensByUser[uid]) invalidTokensByUser[uid] = [];
                        invalidTokensByUser[uid].push(matched);
                    }
                }
            }
        }

        // 🔥 Remove invalid tokens from Firestore for each user
        for (const [uid, tokensToRemove] of Object.entries(invalidTokensByUser)) {
            const remainingTokens = userTokenMap[uid].filter(
                tokenObj => !tokensToRemove.includes(tokenObj)
            );

            await admin.firestore().collection('users').doc(uid).update({
                'messaging.fcmTokens': remainingTokens
            });

            console.log(`🧹 Removed ${tokensToRemove.length} invalid token(s) for user ${uid}`);
        }

        // ✅ Respond to the frontend
        res.status(200).json({
            success: true,
            tokensSent: userTokens.length,
            invalidTokens: invalidTokensByUser,
            results
        });

    } catch (err) {
        console.error("❌ Error sending notification:", err.message);
        res.status(500).json({ error: 'Failed to send notification', details: err.message });
    }
});

module.exports = router;
