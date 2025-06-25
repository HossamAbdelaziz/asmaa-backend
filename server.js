// ✅ Load environment variables first
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const sendInvoiceEmail = require("./utils/sendInvoiceEmail");        // 📩 For sending invoices after payment
const adminRoutes = require("./routes/adminRoutes");                 // 📡 Admin APIs including FCM

const app = express();
const PORT = process.env.PORT || 5001;

// =====================================
// 🔔 STRIPE WEBHOOK HANDLING (RAW BODY)
// =====================================
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log("✅ Webhook verified:", event.type);
    } catch (err) {
        console.error("❌ Webhook verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle specific event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        let customerEmail = session.customer_email || session.customer_details?.email;

        // 📥 Fallback: fetch full customer if needed
        if (!customerEmail && session.customer) {
            try {
                const customer = await stripe.customers.retrieve(session.customer);
                customerEmail = customer.email;
                console.log("📥 Retrieved customer email:", customerEmail);
            } catch (err) {
                console.error("❌ Could not retrieve customer:", err.message);
            }
        }

        const customerName = session.customer_details?.name || "Valued Customer";

        // 🧠 Identify program based on Stripe Payment Link
        let programName = "Your Program";
        switch (session.payment_link) {
            case process.env.PLINK_TEEN_PROGRAM:
                programName = "Teen Eating Disorder Recovery Program";
                break;
            case process.env.PLINK_RECOVERY:
                programName = "Recovery Journey from Eating Disorders";
                break;
            case process.env.PLINK_UNDIET:
                programName = "Undiet Your Mindset Program";
                break;
            case process.env.PLINK_DEEP_HEALTH:
                programName = "Deep Health Course";
                break;
        }

        // ❌ If we can't find an email, skip the invoice
        if (!customerEmail) {
            console.error("❌ No customer email found — invoice not sent.");
            return res.status(400).send("Missing customer email");
        }

        // 💸 Extract payment info
        const amount = session.amount_total / 100;
        const currency = session.currency.toUpperCase();
        const date = new Date().toLocaleString();

        // ✅ Send invoice email
        try {
            await sendInvoiceEmail({
                email: customerEmail,
                amount,
                currency,
                programName,
                date,
                customerName,
            });
            console.log("✅ Invoice email sent to:", customerEmail);
        } catch (err) {
            console.error("❌ Failed to send invoice email:", err.message);
        }
    }

    // ✅ Always respond to Stripe
    res.status(200).end();
});

// ===============================
// 🌐 GLOBAL MIDDLEWARE
// ===============================
app.use(cors());                 // Allow cross-origin requests
app.use(bodyParser.json());      // Parse all non-Stripe JSON bodies

// ===============================
// 🧠 ADMIN ROUTES (Notifications)
// ===============================
app.use("/api/admin", adminRoutes); // e.g., /api/admin/send-notification

// ===============================
// ✅ BASIC HEALTH CHECK ROUTE
// ===============================
app.get("/", (req, res) => {
    res.send("✅ Backend is running!");
});

// ===============================
// ⏰ SCHEDULED NOTIFICATIONS HANDLER
// ===============================
const admin = require("./firebase/firebaseAdmin"); // 🔐 Firestore admin SDK
const sendFCMNotification = require("./utils/sendFCMNotification"); // 📩 Reuse same utility
const { FieldValue } = require("firebase-admin/firestore");

async function processScheduledNotifications() {
    const now = new Date();

    try {
        const snapshot = await admin.firestore().collection("scheduledNotifications").get();
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const notif of docs) {
            const scheduledTime = notif.scheduledAt?.toDate?.() || null;

            if (
                notif.status === "scheduled" &&
                scheduledTime &&
                scheduledTime <= now
            ) {
                console.log(`📨 Sending scheduled notification: ${notif.title}`);

                // ✅ Loop through userTokens (handle both full object or plain string)
                for (const tokenObj of notif.userTokens || []) {
                    const token = typeof tokenObj === "string" ? tokenObj : tokenObj.token;

                    if (!token) continue;

                    await sendFCMNotification({
                        token,
                        title: notif.title,
                        body: notif.body,
                        image: notif.imageUrl || null,
                        data: {
                            notifId: notif.id || '',
                            click_action: 'FLUTTER_NOTIFICATION_CLICK'
                        }
                    });
                }

                // ✅ Mark notification as sent
                await admin.firestore().collection("scheduledNotifications").doc(notif.id).update({
                    status: "sent",
                    sentAt: new Date()
                });

                // ✅ Log it for tracking
                await admin.firestore().collection("logs").add({
                    title: notif.title,
                    body: notif.body,
                    imageUrl: notif.imageUrl || null,
                    userTokens: notif.userTokens || [],
                    userIds: notif.userIds || [],
                    type: 'scheduled',
                    method: 'FCM',
                    status: 'sent',
                    timestamp: new Date()
                });

                // ✅ Add to notifications collection for bell tracking
                await admin.firestore().collection("notifications").add({
                    title: notif.title,
                    body: notif.body,
                    imageUrl: notif.imageUrl || null,
                    type: "scheduled",
                    createdAt: new Date(),
                    delivery: (notif.userIds || []).map(uid => ({
                        uid,
                        seen: false,
                        clicked: false,
                        seenAt: null,
                        clickedAt: null
                    }))
                });

                console.log(`✅ Sent and marked as sent: ${notif.title}`);
            }
        }
    } catch (err) {
        console.error("❌ Scheduled notification error:", err.message);
    }
}

// 🔁 Run check every 60 seconds
setInterval(processScheduledNotifications, 60000);

// ===============================
// 🚀 START SERVER
// ===============================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
