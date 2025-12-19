const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getSmtpTransporter } = require("./transporter");
const { generateEmailContent } = require("./emailTemplate");

admin.initializeApp();
const db = admin.database();

exports.sendSummaryEmail = onSchedule("0 * * * *", async (event) => {
    const transporter = getSmtpTransporter();
    if (!transporter) return null;

    const usersSnap = await db.ref("users").once("value");
    const usersData = usersSnap.val();
    if (!usersData) return null;

    for (const uid in usersData) {
        const userData = usersData[uid];
        const prefs = userData.settings?.prefs;
        if (!prefs?.emailSummaryEnabled) continue;

        const tasksSnap = await db.ref(`users/${uid}/tasks`)
            .orderByChild("isCompleted").equalTo(false).limitToFirst(10).once("value");
        
        const tasks = tasksSnap.val() ? Object.values(tasksSnap.val()) : [];
        const { html, text } = generateEmailContent(userData.profile?.displayName, tasks, process.env.APP_URL);

        await transporter.sendMail({
            from: `"TaskSpace Pro" <${process.env.SENDER_EMAIL}>`,
            to: userData.profile.email,
            subject: "[TaskSpace Pro] Resumen de Tareas",
            html,
            text
        });
        await db.ref(`users/${uid}/lastSummarySent`).set(Date.now());
    }
});