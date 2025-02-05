const twilio = require('twilio');
require('dotenv').config()
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function main() {
    try {
        // sendEmail(["nathikazad@gmail.com"], "error message", "alerts", "rose")
        const message = await twilioClient.messages.create({
            body: `Test`,
            from: "+18023922420",
            to: "+12098628445"
        });
        console.log('Message sent successfully!');
        console.log('Message SID:', message.sid);
        console.log('Status:', message.status);
    } catch (error) {
        console.error('Error sending SMS:', error);
    }
}

async function sendEmail(recipients, errorMessage, topic, controlName) {
    try {
        const msg = {
            to: recipients,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: `Alert: ${controlName}`,
            html: `
                <h2>System Alert</h2>
                <p><strong>Control Name:</strong> ${controlName}</p>
                <p><strong>Topic:</strong> ${topic}</p>
                <p><strong>Error:</strong> ${errorMessage}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            `,
        };

        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        console.error(error.response?.body?.errors || error);
    }
}
main()