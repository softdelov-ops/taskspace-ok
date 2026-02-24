const admin = require("firebase-admin");
const { getSmtpTransporter } = require("./transporter");
const { generateEmailContent } = require("./emailTemplate");

const db = admin.database();

async function procesarEnvioDeEmails() {
    console.log("Iniciando proceso de envío de correos...");

    const transporter = getSmtpTransporter();
    if (!transporter) {
        console.error("No se pudo configurar el transporte de SMTP. Verifica tus variables de entorno.");
        return;
    }

    const usersSnap = await db.ref("users").once("value");
    const usersData = usersSnap.val();
    
    if (!usersData) {
        console.log("No se encontraron usuarios en la base de datos.");
        return;
    }

    // Construimos la URL completa usando la variable de entorno
    // Agregamos https:// para que el botón del correo sea un enlace funcional
    const fullAppUrl = `https://${process.env.VITE_FIREBASE_AUTH_DOMAIN}`;

    for (const uid in usersData) {
        const userData = usersData[uid];
        const prefs = userData.settings?.prefs;

        if (!prefs?.emailSummaryEnabled) {
            console.log(`Usuario ${uid} tiene los correos desactivados. Saltando...`);
            continue;
        }

        const tasksSnap = await db.ref(`users/${uid}/tasks`)
            .orderByChild("isCompleted").equalTo(false)
            .limitToFirst(10).once("value");
        
        const tasks = tasksSnap.val() ? Object.values(tasksSnap.val()) : [];
        
        // Pasamos fullAppUrl en lugar de solo la variable de entorno
        const { html, text } = generateEmailContent(
            userData.profile?.displayName || "Usuario", 
            tasks, 
            fullAppUrl
        );

        try {
            await transporter.sendMail({
                from: `"TaskSpace Pro" <${process.env.SMTP_USERNAME}>`, // Usamos SMTP_USERNAME como remitente
                to: userData.profile.email,
                subject: "[TaskSpace] Tu resumen de tareas pendientes",
                text: text,
                html: html,
            });
            console.log(`✅ Resumen enviado correctamente a: ${userData.profile.email}`);
        } catch (error) {
            console.error(`❌ Error enviando correo a ${userData.profile.email}:`, error);
        }
    }
    
    console.log("Proceso de emails finalizado.");
}

module.exports = { procesarEnvioDeEmails };