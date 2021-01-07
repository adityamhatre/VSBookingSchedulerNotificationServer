import express from 'express';
import admin from 'firebase-admin';
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid';

const app = express()
const jsonParser = bodyParser.json()

const serviceAccount = JSON.parse(process.env.service_account_json)

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});


const sendNotificationToTopic = (topic, data) => {
    var message = {
        topic, data: { ...data, topic, notificationId: uuidv4() }
    };

    admin.messaging().send(message)
        .then((response) => {
            console.log('Successfully sent message:', response);
        })
        .catch((error) => {
            console.log('Error sending message:', error);
        });
}


app.post('/notifications/newBookingCreated', jsonParser, (req, res) => {
    const topic = 'new-booking-topic';
    sendNotificationToTopic(topic, req.body)
    res.send()
})

app.post('/notifications/updatedBooking', jsonParser, (req, res) => {
    const topic = 'updated-booking-topic';
    sendNotificationToTopic(topic, req.body)
    res.send()
})


app.get("/*", (req, res) => {
    res.send('Not Allowed')
})

app.listen(process.env.PORT || 80, () => {
    console.log(`Server listening on port ${process.env.PORT || 80}!`);
});