const admin = require('../firebase/firebaseAdmin');

// Main FCM sender function
const sendFCMNotification = async ({ token, title, body, image, data = {} }) => {
    // 🔐 Safety check: skip invalid tokens
    if (!token || typeof token !== 'string' || token.trim() === '') {
        console.warn("⚠️ Skipping invalid or empty token:", token);
        return {
            success: false,
            token,
            errorCode: 'invalid-token'
        };
    }

    try {
        // ✅ Build the message payload for all platforms
        const message = {
            token, // 🎯 Target this specific device token

            // 🧾 System-level notification (required for background push to work)
            notification: {
                title,
                body
            },

            // 📱 Android-specific settings
            android: {
                priority: 'high',
                notification: {
                    title,
                    body,
                    image,
                    sound: 'default',
                    channelId: 'default' // 🔊 Should match the native channel ID
                }
            },

            // 🍏 iOS-specific settings
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title,
                            body
                        },
                        sound: 'default',
                        'mutable-content': 1
                    }
                },
                fcmOptions: {
                    image
                }
            },

            // 🌐 Web push fallback (Chrome, etc.)
            webpush: {
                headers: {
                    Urgency: 'high'
                },
                notification: {
                    title,
                    body,
                    icon: '/logo192.png',
                    image,
                    vibrate: [100, 50, 100],
                    sound: 'default'
                }
            },

            // 🧠 Data-only payload (useful inside the app)
            data: {
                ...data,
                notifId: data.notifId || '', // Used to open notification details
                click_action: 'FLUTTER_NOTIFICATION_CLICK' // 📌 Android: ensures tap works
            }
        };

        // 🐛 Log the final payload being sent
        console.log("🚀 Sending FCM payload:\n", JSON.stringify(message, null, 2));

        // 📤 Send the message using Firebase Admin SDK
        const response = await admin.messaging().send(message);

        // ✅ Return success
        return { success: true, token, response };
    } catch (error) {
        // ❌ Catch any send errors
        console.error("❌ Failed to send to token:", token, error.message, error);
        console.error("❌ Failed to send to token:", token);
        console.error("Error message:", error.message);
        console.error("Full error:", error);

        return {
            success: false,
            token,
            errorCode: error.code || "unknown-error"
        };
    }
};

// 📦 Export the function for use in routes or schedulers
module.exports = sendFCMNotification;
