const { format } = require("date-fns");
const { es } = require("date-fns/locale");

const getTaskTitle = (task) => task.title || task.name || "Tarea sin título";

function generateEmailContent(displayName, tasks, appUrl) {
    const primaryColor = "#1e90ff";
    const accentColor = "#ff4757";

    let tasksListHtml = '';
    if (tasks.length === 0) {
        tasksListHtml = `<p style="text-align: center; color: #555;">🎉 ¡Felicidades! No tienes tareas pendientes.</p>`;
    } else {
        tasks.forEach((task) => {
            const title = getTaskTitle(task);
            const dueDate = new Date(task.dateTime || Date.now());
            const formattedDate = format(dueDate, "dd MMMM yyyy", { locale: es });
            tasksListHtml += `
                <div style="padding: 15px; border-left: 4px solid ${accentColor}; background-color: #f8f8f8; margin-bottom: 10px; border-radius: 4px;">
                    <h4 style="margin: 0 0 5px 0; color: #333; font-size: 16px;">${title}</h4>
                    <p style="margin: 0; color: #666; font-size: 14px;">Vence: <strong>${formattedDate}</strong></p>
                </div>`;
        });
    }

    const html = `<!DOCTYPE html><html>...${tasksListHtml}...</html>`; // (Contenido HTML simplificado por espacio)
    const text = `Hola ${displayName}, tienes ${tasks.length} tareas.`;

    return { html, text };
}

module.exports = { generateEmailContent };