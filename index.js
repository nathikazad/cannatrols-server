const mqtt = require('mqtt');
const { Resend } = require('resend');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
// Heroku assigns a dynamic port via process.env.PORT
const PORT = process.env.PORT || 3000;
// Use a directory that Heroku can write to
const ALERTS_FILE = path.join('/tmp', 'system_alerts.json');

const hiveMQConfig = {
    host: process.env.HIVEMQ_HOST,
    port: parseInt(process.env.HIVEMQ_PORT) || 8883,
    protocol: 'mqtts',
    username: process.env.HIVEMQ_USERNAME,
    password: process.env.HIVEMQ_PASSWORD
};

const resend = new Resend(process.env.RESEND_API_KEY);
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
        // If file doesn't exist, create it with empty array
        await writeAlerts([]);
        return [];
    }
}

async function writeAlerts(alerts) {
    // Ensure directory exists
    const dir = path.dirname(ALERTS_FILE);
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2));
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
        // Write an empty array to the alerts file
        await writeAlerts([]);
        console.log('Alerts file has been reset');
        res.json({ message: 'Alerts reset successful' });
    } catch (error) {
        console.error('Error resetting alerts:', error);
        res.status(500).json({ error: 'Failed to reset alerts' });
    }
});

function connectMQTT() {
    client = mqtt.connect(hiveMQConfig);

    client.on('connect', () => {
        console.log('Connected to HiveMQ broker');
        client.subscribe('CommercialSystemAlarms/#', (err) => {
            if (!err) {
                console.log('Successfully subscribed to CommercialSystemAlerts/#');
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
                const contacts = contactsPart.split(',');
                const emailAddresses = contacts.filter(contact => contact.includes('@'));
                const phoneNumbers = contacts.filter(contact => !contact.includes('@'));

                const alert = {
                    timestamp: new Date().toISOString(),
                    controlName,
                    errorMessage,
                    contacts: contacts.map(contact => ({
                        value: contact,
                        type: contact.includes('@') ? 'email' : 'phone'
                    }))
                };

                const alerts = await readAlerts();
                // Keep only last 1000 alerts to manage storage
                alerts.push(alert);
                if (alerts.length > 1000) {
                    alerts.shift(); // Remove oldest alert
                }
                await writeAlerts(alerts);

                if (emailAddresses.length > 0) {
                    await sendEmail(emailAddresses, errorMessage, topic, controlName);
                }

                if (phoneNumbers.length > 0) {
                    console.log('Phone numbers to notify:', phoneNumbers);
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

async function sendEmail(recipients, errorMessage, topic, controlName) {
    try {
        const data = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: recipients,
            subject: `Alert: ${controlName}`,
            html: `
                <h2>System Alert</h2>
                <p><strong>Control Name:</strong> ${controlName}</p>
                <p><strong>Topic:</strong> ${topic}</p>
                <p><strong>Error:</strong> ${errorMessage}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            `
        });
        console.log('Email sent successfully:', data);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

// Start both the Express server and MQTT client
app.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
    // Start MQTT connection after Express server is running
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
    // Attempt to reconnect MQTT if it was an MQTT error
    if (client) {
        client.end();
        setTimeout(connectMQTT, 5000);
    }
});