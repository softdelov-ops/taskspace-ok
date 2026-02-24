const { format } = require("date-fns");
const { es } = require("date-fns/locale");

/**
 * Genera el contenido del correo con el estilo visual solicitado.
 * @param {string} displayName Nombre del usuario.
 * @param {Array} tasks Lista de objetos de tareas.
 * @param {string} appUrl Enlace a la aplicación.
 */
function generateEmailContent(displayName, tasks, appUrl) {
    const primaryColor = "#1e90ff";
    const accentColor = "#ff4757";

    // Generar la lista de tareas dinámicamente
    let tasksListHtml = '';
    
    if (tasks.length === 0) {
        tasksListHtml = `
            <p style="text-align: center; color: #555; font-family: Arial, sans-serif;">
                🎉 ¡Felicidades! No tienes tareas pendientes para hoy.
            </p>`;
    } else {
        tasks.forEach((task) => {
            const title = task.title || task.name || "Tarea sin título";
            // Manejo de fecha: si no hay fecha, usamos la actual por seguridad
            const dueDate = new Date(task.dateTime || Date.now());
            const formattedDate = format(dueDate, "dd MMMM yyyy", { locale: es });
            
            tasksListHtml += `
                <div style="padding: 15px; border-left: 4px solid ${accentColor}; background-color: #f8f8f8; margin-bottom: 10px; border-radius: 4px; font-family: Arial, sans-serif;">
                    <h4 style="margin: 0 0 5px 0; color: #333; font-size: 16px;">${title}</h4>
                    <p style="margin: 0; color: #666; font-size: 14px;">Vence: <strong>${formattedDate}</strong></p>
                </div>`;
        });
    }

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 500px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; font-family: Arial, sans-serif; overflow: hidden; background-color: white;">
            
            <div style="background-color: ${primaryColor}; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 22px;">TaskSpace Pro Resumen</h1>
            </div>

            <div style="padding: 20px; background-color: white;">
                <p style="font-size: 16px; color: #333;">Hola <strong>${displayName}</strong>,</p>
                <p style="font-size: 15px; color: #555;">
                    ¡Tu resumen ya está listo! Tienes <strong>${tasks.length}</strong> tarea(s) pendiente(s) que requieren tu atención inmediata:
                </p>

                <div style="margin-top: 20px; margin-bottom: 20px;">
                    ${tasksListHtml}
                </div>

                <div style="text-align: center; margin-top: 25px;">
                    <a href="${appUrl}" style="background-color: ${primaryColor}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                        Ir a mis Tareas
                    </a>
                </div>
            </div>

            <div style="background-color: #eee; color: #777; padding: 15px; text-align: center; font-size: 11px;">
                <p style="margin: 0;">© 2026 TaskSpace Pro. Este es un correo automático.</p>
            </div>
        </div>
    </body>
    </html>`;

    // Versión en texto plano para clientes de correo básicos
    const text = `Hola ${displayName}, tienes ${tasks.length} tareas pendientes en TaskSpace. Visita: ${appUrl}`;

    return { html, text };
}

module.exports = { generateEmailContent };