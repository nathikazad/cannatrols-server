const mqtt = require('mqtt');
const { Resend } = require('resend');

const hiveMQConfig = {
    host: process.env.HIVEMQ_HOST || '9ef50ac894a64630ab0c5fbe4b888474.s1.eu.hivemq.cloud',
    port: parseInt(process.env.HIVEMQ_PORT) || 8883,
    protocol: 'mqtts',
    username: process.env.HIVEMQ_USERNAME || 'nathikazad',
    password: process.env.HIVEMQ_PASSWORD
};

const resend = new Resend(process.env.RESEND_API_KEY);
let client;

function connectMQTT() {
    client = mqtt.connect(hiveMQConfig);

    client.on('connect', () => {
        console.log('Connected to HiveMQ broker');
        // Subscribe to all messages under CommercialSystemAlerts
        client.subscribe('CommercialSystemAlerts/#', (err) => {
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
            // Extract machine name from topic
            const controlName = topic.split('/')[1]; // CommercialSystemAlerts/[MachineName]/...
            
            console.log(`Received message:`);
            console.log(`Topic: ${topic}`);
            console.log(`Control Name: ${controlName}`);
            console.log(`Message: ${messageStr}`);

            // Parse the message using the format from your previous messages
            const [errorMessage, contactsPart] = messageStr.split(':SENDTO:');
            if (contactsPart) {
                const contacts = contactsPart.split(',');
                
                // Send email to all email addresses
                const emailAddresses = contacts.filter(contact => contact.includes('@'));
                if (emailAddresses.length > 0) {
                    await sendEmail(emailAddresses, errorMessage, topic);
                }

                // Handle phone numbers if needed
                const phoneNumbers = contacts.filter(contact => !contact.includes('@'));
                if (phoneNumbers.length > 0) {
                    console.log('Phone numbers to notify:', phoneNumbers);
                    // Add your SMS/phone notification logic here
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

async function sendEmail(recipients, errorMessage, topic) {
    try {
        const data = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: recipients,
            subject: `Alert: ${topic}`,
            html: `
                <h2>System Alert</h2>
                <p><strong>Machine:</strong> ${topic.split('/')[1]}</p>
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

// Start the connection
connectMQTT();

// Handle process termination
process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal');
    if (client) {
        client.end();
    }
    process.exit(0);
});