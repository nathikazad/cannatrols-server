const mqtt = require('mqtt');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sgMail = require('@sendgrid/mail');
const { SinchClient, SmsRegion } = require('@sinch/sdk-core');

const app = express();
const PORT = process.env.PORT || 3000;
const ALERTS_FILE = path.join('/tmp', 'system_alerts.json');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const hiveMQConfig = {
    host: process.env.HIVEMQ_HOST,
    port: parseInt(process.env.HIVEMQ_PORT) || 8883,
    protocol: 'mqtts',
    username: process.env.HIVEMQ_USERNAME,
    password: process.env.HIVEMQ_PASSWORD
};

let client;

// Add basic health check endpoint
app.get('/', (req, res) => {
    res.send('Service is running');
});

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

async function readAlerts() {
    try {
        await fs.access(ALERTS_FILE);
        const data = await fs.readFile(ALERTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        await writeAlerts([]);
        return [];
    }
}

async function writeAlerts(alerts) {
    const dir = path.dirname(ALERTS_FILE);
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2));
}

async function sendSMS(phoneNumbers, errorMessage, controlName) {
    try {
        const smsService = new SinchClient({
            projectId: process.env['SINCH_PROJECT_ID'],
            keyId: process.env['SINCH_KEY_ID'],
            keySecret: process.env['SINCH_KEY_SECRET'],
            smsRegion: process.env['SINCH_SMS_REGION'] || SmsRegion.UNITED_STATES,
        });

        const from = process.env['SINCH_FROM_NUMBER'];
        const body = `Alert: ${controlName}\nError: ${errorMessage}\nTime: ${new Date().toLocaleString()}`;

        const requestData = {
            sendSMSRequestBody: {
                type: 'mt_text',
                from,
                to: phoneNumbers,
                body,
            },
        };

        const response = await smsService.sms.batches.send(requestData);
        
        // Log success for all numbers since Sinch handles batch sending
        phoneNumbers.forEach(phoneNumber => {
            console.log(`SMS sent successfully to ${phoneNumber}`);
        });

        return response;
    } catch (error) {
        // Log the error and which numbers were affected
        phoneNumbers.forEach(phoneNumber => {
            console.error(`Failed to send SMS to ${phoneNumber}:`, error);
        });
        throw error;
    }
}

async function sendEmail(recipients, errorMessage, topic, controlName) {
    try {
        const msg = {
            to: recipients,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: `Alert from ${controlName}`,
            html: `
                <p><strong>${errorMessage}</strong></p>
            `,
        };

        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        console.error(error.response?.body?.errors || error);
    }
}

// Initialize Express endpoints
app.get('/alerts', async (req, res) => {
    try {
        const alerts = await readAlerts();
        res.json(alerts);
    } catch (error) {
        console.error('Error reading alerts:', error);
        res.status(500).json({ error: 'Failed to retrieve alerts' });
    }
});

app.get('/reset-alerts', async (req, res) => {
    try {
        await writeAlerts([]);
        console.log('Alerts file has been reset');
        res.json({ message: 'Alerts reset successful' });
    } catch (error) {
        console.error('Error resetting alerts:', error);
        res.status(500).json({ error: 'Failed to reset alerts' });
    }
});

function separateContactInfo(contacts) {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const phoneRegex = /^\+?[1]?[-\s]?\(?([0-9]{3})\)?[-\s]?([0-9]{3})[-\s]?([0-9]{4})$/;
 
    const emails = contacts.filter(contact => emailRegex.test(contact.trim()));
    
    const phoneNumbers = contacts.filter(contact => {
        const digitsOnly = contact.replace(/\D/g, '');
        const isValidFormat = phoneRegex.test(contact.trim());
        const isValidLength = digitsOnly.length === 10 || 
            (digitsOnly.length === 11 && digitsOnly.startsWith('1'));
        
        return isValidFormat && isValidLength;
    });
    // console.log(`Returned ${{ emails, phoneNumbers }}`)
    return {
        emails: emails,
        phoneNumbers: phoneNumbers
    };
 }

function connectMQTT() {
    client = mqtt.connect(hiveMQConfig);

    client.on('connect', () => {
        console.log('Connected to HiveMQ broker');
        client.subscribe('#', (err) => {
        // client.subscribe('CommercialSystemAlarms/#', (err) => {
            if (!err) {
                console.log('Successfully subscribed to CommercialSystemAlarms/#');
            } else {
                console.error('Subscription error:', err);
            }
        });
    });

    client.on('message', async (topic, message) => {
        try {
            const messageStr = message.toString();
            const controlName = topic.split('/')[1];
            
            console.log(`Received message:`);
            console.log(`Topic: ${topic}`);
            console.log(`Control Name: ${controlName}`);
            console.log(`Message: ${messageStr}`);

            const [errorMessage, contactsPart] = messageStr.split(':SENDTO:');
            if (contactsPart) {
                console.log(`contacts ${contactsPart.split(',')}`)
                const splitContacts = separateContactInfo(contactsPart.split(','));
                const emailAddresses = splitContacts.emails
                const phoneNumbers = splitContacts.phoneNumbers

                const alert = {
                    timestamp: new Date().toISOString(),
                    controlName,
                    errorMessage,
                    contacts: splitContacts
                };

                const alerts = await readAlerts();
                alerts.push(alert);
                if (alerts.length > 1000) {
                    alerts.shift();
                }
                await writeAlerts(alerts);

                if (emailAddresses.length > 0) {
                    await sendEmail(emailAddresses, errorMessage, topic, controlName);
                }

                if (phoneNumbers.length > 0) {
                    await sendSMS(phoneNumbers, errorMessage, controlName);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    client.on('error', (error) => {
        console.error('MQTT Error:', error);
        setTimeout(connectMQTT, 5000);
    });

    client.on('close', () => {
        console.log('Connection to HiveMQ broker closed');
        setTimeout(connectMQTT, 5000);
    });
}

// Start both the Express server and MQTT client
app.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
    connectMQTT();
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal');
    if (client) {
        client.end();
    }
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (client) {
        client.end();
        setTimeout(connectMQTT, 5000);
    }
});