/* eslint-disable linebreak-style */
/* eslint-disable max-len */
/* eslint-disable linebreak-style */
/* eslint-disable valid-jsdoc */
/* eslint-disable linebreak-style */
/* eslint-disable object-curly-spacing */
const { format } = require("date-fns");
const { es } = require("date-fns/locale");

/**
 * Genera el HTML/CSS del resumen de tareas
 */
const generateTaskEmail = (tasks, userName) => {
  const taskListHtml = tasks.map((t) => `
        <li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
            <strong style="color: #333;">${t.name}</strong><br>
            <span style="font-size: 12px; color: #666;">
                Vence: ${t.dateTime ? format(new Date(t.dateTime), "PPPPp", { locale: es }) : "Sin fecha"}
            </span>
        </li>
    `).join("");

  return {
    subject: `📋 Resumen de Tareas para ${userName}`,
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                <h2 style="color: #0d6efd;">Hola ${userName},</h2>
                <p>Aquí tienes un resumen de tus tareas pendientes en <strong>TaskSpace Pro</strong>:</p>
                <ul style="list-style: none; padding: 0;">
                    ${taskListHtml}
                </ul>
                <p style="margin-top: 20px; font-size: 12px; color: #999;">
                    Este es un correo automático, por favor no respondas.
                </p>
            </div>
        `,
  };
};

module.exports = { generateTaskEmail };
