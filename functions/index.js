const admin = require("firebase-admin");

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Importamos la función de email.js
const { procesarEnvioDeEmails } = require("./email");

// 1. Disparador por RELOJ (Cada hora)
exports.sendSummaryEmail = onSchedule("0 * * * *", async (event) => {
    await procesarEnvioDeEmails();
});

// 2. Disparador por POSTMAN (URL)
exports.testEmailPostman = onRequest({ cors: true }, async (req, res) => {
    try {
        await procesarEnvioDeEmails();
        res.status(200).send("✅ Emails enviados desde Postman.");
    } catch (error) {
        res.status(500).send("❌ Error: " + error.message);
    }
});