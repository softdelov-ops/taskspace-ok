const nodemailer = require("nodemailer");

function getSmtpTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        return null;
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        // Convertimos el string "true" o "false" a un booleano real
        secure: process.env.SMTP_SECURE === 'true',
        auth: { 
            user: process.env.SMTP_USERNAME, 
            pass: process.env.SMTP_PASSWORD 
        },
    });
}

module.exports = { getSmtpTransporter };