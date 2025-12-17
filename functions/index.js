/* eslint-disable comma-dangle */
/* eslint-disable quotes */
/* eslint-disable arrow-parens */
/* eslint-disable no-trailing-spaces */
/* eslint-disable max-len */
/* eslint-disable indent */
/* eslint-disable object-curly-spacing */
/* eslint-disable eol-last */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const transporter = require("./transporter");
const { generateTaskEmail } = require("./emailTemplate");

admin.initializeApp();
// 👇 CAMBIO CLAVE: Realtime Database
const db = admin.database();

// Endpoint de prueba (HTTP)
exports.sendTestEmail = functions.https.onRequest(async (req, res) => {
    const TEST_USER_UID = "o2Ys6KW9BzWTj20irQ5QmI5JHLm2"; 
    const TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL;

    try {
        const snapshot = await db.ref(`users/${TEST_USER_UID}/tasks`).once("value");
        const tasksObj = snapshot.val() || {};
        
        // Filtrar pendientes
        const pendingTasks = Object.values(tasksObj).filter(t => !t.isCompleted);

        const emailContent = generateTaskEmail(pendingTasks, "Usuario de Prueba");

        await transporter.sendMail({
            from: '"TaskSpace Alerts" <alerts@taskspacepro.com>',
            to: TEST_RECIPIENT_EMAIL,
            subject: emailContent.subject,
            html: emailContent.html
        });

        res.send(`✅ Correo enviado con éxito a ${TEST_RECIPIENT_EMAIL}`);
    } catch (e) {
        console.error("Error:", e);
        res.status(500).send("Error: " + e.message);
    }
});

// Función programada (Cron Job)
exports.scheduledTaskSummary = onSchedule("0 9 * * *", async (event) => {
    // Aquí iría la lógica para recorrer todos los usuarios y enviar sus resúmenes
    functions.logger.info("Ejecutando resumen diario de tareas...");
});