const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");

admin.initializeApp();
const db = admin.firestore();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// Mecanismo simple: colección reminders con sendAt y sent flag
exports.sendDueReminders = functions.pubsub.schedule("every 1 minutes").onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  const snaps = await db.collection("reminders").where("sendAt", "<=", now).where("sent", "==", false).limit(100).get();
  const batch = db.batch();
  const promises = [];

  snaps.forEach(s => {
    const r = s.data();
    const ref = s.ref;
    if (r.method === "push" && r.pushTokens?.length) {
      promises.push(admin.messaging().sendToDevice(r.pushTokens, { notification: { title: r.title, body: r.body }, data: { taskId: r.taskId } }));
    }
    if (r.method === "email" && r.email) {
      const msg = { to: r.email, from: "no-reply@taskspace.app", subject: r.title, text: r.body };
      promises.push(sgMail.send(msg));
    }
    if (r.method === "whatsapp" && r.phone) {
      promises.push(twilioClient.messages.create({ from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, to: `whatsapp:${r.phone}`, body: r.body }));
    }
    batch.update(ref, { sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  await Promise.all(promises);
  await batch.commit();
  return null;
});
