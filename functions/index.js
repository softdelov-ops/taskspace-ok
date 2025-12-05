/* eslint-disable eol-last */
/* eslint-disable comma-dangle */
/* eslint-disable object-curly-spacing */
/* eslint-disable operator-linebreak */
/* eslint-disable indent */
/* eslint-disable valid-jsdoc */
/* eslint-disable max-len */
/**
 * Lógica de Backend (Cloud Functions) para TaskSpace Pro con Mailtrap (API SDK)
 * 💡 Se prioriza functions.config() para despliegue y se usa process.env.MAILTRAP_TOKEN como fallback local.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { MailtrapClient } = require("mailtrap");

// Inicializa la aplicación Admin SDK
admin.initializeApp();
const db = admin.firestore();

// ➡️ Lógica para obtener el token, priorizando Firebase Config (producción)
// y cayendo a process.env (desarrollo local).

const MAILTRAP_TOKEN = process.env.MAILTRAP_TOKEN;

// ➡️ Inicializar el Cliente de Mailtrap.
let mailtrapClient;
if (MAILTRAP_TOKEN) {
  mailtrapClient = new MailtrapClient({
    token: MAILTRAP_TOKEN,
  });
} else {
// Esto se registrará si no se encuentra en ningún lugar (fallo de configuración)
  functions.logger.error("El token de Mailtrap (MAILTRAP_TOKEN) no está configurado. El envío de correos fallará.");
}

const SENDER_EMAIL = "noreply@taskspace.com";

/**
 * 1. Funciones Auxiliares
 * --------------------------------------------------------------------------
 */

/**
 * Calcula la elegibilidad de envío de email.
 */
function isSummaryDue(lastSentTimestamp, value, unit) {
  if (!lastSentTimestamp) return true;
  const lastSentTime = lastSentTimestamp.toDate().getTime();
  const now = Date.now();
  const elapsed = now - lastSentTime;
  let requiredIntervalMs = 0;

  switch (unit) {
    case "m": requiredIntervalMs = value * 60000; break;
    case "h": requiredIntervalMs = value * 3600000; break;
    case "d": requiredIntervalMs = value * 86400000; break;
    case "w": requiredIntervalMs = value * 604800000; break;
    case "mo": requiredIntervalMs = value * 2592000000; break;
    default: return false;
  }
  return elapsed >= requiredIntervalMs;
}

/**
 * Genera el contenido del email de resumen de tareas pendientes.
 */
function buildEmailContent(displayName, tasks) {
  let taskListHtml = tasks.map((t) => {
    const dueTime = t.dateTime ?
      "(Vence: " + t.dateTime.toDate().toLocaleString("es-ES", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }) + ")"
      : "";
    const priorityEmoji =
      { urgente: "🔥", alta: "⬆️", media: "⏺️", baja: "⬇️" }[t.priority] || "";
    return `
      <li style="margin-bottom: 10px; border-left: 3px solid ${priorityColor(t.priority)}; padding-left: 10px; list-style: none;">
        <strong>${priorityEmoji} ${t.name}</strong> ${dueTime}
        <br>
        <span style="color: #6c757d; font-size: 0.9em;">
          Notas: ${t.notes || "N/A"}
        </span>
      </li>
    `;
  }).join("");

  if (tasks.length === 0) {
    taskListHtml =
      "<p style=\"color: green; font-weight: bold;\">¡Enhorabuena! No tienes tareas pendientes para este resumen.</p>";
  }

  const subject = `[TaskSpace] Resumen de Tareas Pendientes para ${displayName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #0d6efd;">Hola, ${displayName}</h2>
      <p>
        Aquí está tu resumen de tareas pendientes. Tienes
        ${tasks.length} tarea(s) en tu lista.
      </p>
      <ul style="padding-left: 0;">
        ${taskListHtml}
      </ul>
      <hr>
      <p style="font-size: 0.9em; color: #6c757d;">
        Puedes modificar la frecuencia de estos correos en la configuración
        de tu perfil en TaskSpace.
      </p>
    </div>
  `;
  const text = `Hola, ${displayName}. Tienes ${tasks.length} tarea(s) pendientes.`;


  return { subject, html, text };
}

/**
 * Devuelve el color hexadecimal asociado a la prioridad de la tarea.
 */
function priorityColor(priority) {
  switch (priority) {
    case "urgente": return "#dc3545";
    case "alta": return "#fd7e14";
    case "media": return "#0d6efd";
    case "baja": return "#6c757d";
    default: return "#6c757d";
  }
}

// ************************************************************
// 2. FUNCIÓN PROGRAMADA (CRON JOB)
// ************************************************************

exports.sendEmailSummaries = functions.pubsub
  .schedule("*/15 * * * *")
  .timeZone("America/Buenos_Aires")
  .onRun(async () => {
    // ➡️ Verificación de la inicialización de Mailtrap
    if (!mailtrapClient) {
        functions.logger.error("El cliente de Mailtrap no se pudo inicializar. Abortando la ejecución.");
        return null;
    }

    functions.logger.info("Iniciando envío de resúmenes de email con Mailtrap API.");
    const nowTimestamp = admin.firestore.Timestamp.now();

    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      const userEmail = userData.email;
      const displayName = userData.displayName || userEmail.split("@")[0];

      const prefsRef = db.collection("users").doc(uid).collection("settings").doc("prefs");
      const prefsDoc = await prefsRef.get();

      if (!prefsDoc.exists) {
        functions.logger.warn(`Preferencias no encontradas para UID: ${uid}.`);
        continue;
      }

      const prefs = prefsDoc.data();
      if (!prefs.emailSummaryEnabled) {
        functions.logger.log(`Email desactivado para ${userEmail}.`);
        continue;
      }

      const lastSent = userData.lastSummarySent;
      const isDue = isSummaryDue(lastSent, prefs.emailSummaryValue, prefs.emailSummaryUnit);
      if (!isDue) {
        functions.logger.log(`Resumen no debido para ${userEmail}.`);
        continue;
      }

      const tasksSnapshot = await db.collection("users").doc(uid).collection("tasks")
        .where("isCompleted", "==", false)
        .orderBy("priority", "desc")
        .orderBy("dateTime", "asc")
        .get();

      const pendingTasks = tasksSnapshot.docs.map((doc) => doc.data());

      try {
        const { subject, html, text } = buildEmailContent(displayName, pendingTasks);

        // 🚀 Envío con el SDK de Mailtrap
        await mailtrapClient.send({
          from: {
            email: SENDER_EMAIL,
            name: "TaskSpace Pro"
          },
          to: [{ email: userEmail }],
          subject: subject,
          html: html,
          text: text,
        });

        await db.collection("users").doc(uid).update({
          lastSummarySent: nowTimestamp,
        });

        functions.logger.log(`Resumen enviado a ${userEmail} vía Mailtrap API.`);
      } catch (error) {
        functions.logger.error(`Error al enviar resumen a ${userEmail}: ${error.message}`, error);
      }
    }

    functions.logger.info("Envío de resúmenes finalizado.");
    return null;
  });

// ******************************************************
// 3. OTRAS FUNCIONES (Opcional)
// ******************************************************

exports.onTaskCreate = functions.firestore
  .document("users/{userId}/tasks/{taskId}")
  .onCreate((snap, context) => {
    const task = snap.data();
    functions.logger.log(
      "Nueva tarea creada para el usuario " +
      context.params.userId +
      ": " +
      task.name,
    );
    return null;
});