// to test the different npm packages
const twilio = require('twilio');
const { SinchClient, SmsRegion } = require('@sinch/sdk-core');

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
        let result = await sendSMS()
        console.log('Result:', result)
    } catch (error) {
        console.error('Error sending SMS:', error);
    }
}

let smsService = new SinchClient({
    projectId: process.env['SINCH_PROJECT_ID'],
    keyId: process.env['SINCH_KEY_ID'],
    keySecret: process.env['SINCH_KEY_SECRET'],
    smsRegion: process.env['SINCH_SMS_REGION'] || SmsRegion.UNITED_STATES,
  });





async function sendSMS() {
    const from = process.env['SINCH_FROM_NUMBER'];
    const recipient = '+12098628445';
    const body = 'This is a test SMS message using the Sinch Node.js SDK.';

    /** @type {Sms.SendSMSRequestData} */
    const requestData = {
        sendSMSRequestBody: {
            type: 'mt_text',
            from,
            to: [recipient],
            body,
        },
    };

    const response = await smsService.sms.batches.send(requestData);

    console.log(`Response:\n${JSON.stringify(response, null, 2)}`);
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
