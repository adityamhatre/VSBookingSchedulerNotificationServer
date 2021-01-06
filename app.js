import express from 'express';
import admin from 'firebase-admin';
import bodyParser from 'body-parser'

const app = express()
const jsonParser = bodyParser.json()


const serviceAccount = JSON.parse(process.env.service_account_json)
const databaseUrl = process.env.firebase_rtdb_url

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseUrl
});


const defaultDatabase = admin.database()

const addNewBooking = (body) => {
    defaultDatabase.ref('/notifications/newBookings/').push({ ...body })
}

defaultDatabase.ref('notifications/newBookings/').on('child_added', snapshot => {
    var topic = 'new-booking-topic';

    var message = {
        data: snapshot.val(),
        topic: topic
    };

    admin.messaging().send(message)
        .then((response) => {
            snapshot.ref.remove()
            console.log('Successfully sent message:', response);
        })
        .catch((error) => {
            console.log('Error sending message:', error);
        });

}, errorObject => {
    console.log("The read failed: " + errorObject.code)
})

app.post('/notifications/newBookings', jsonParser, (req, res) => {
    addNewBooking(req.body)
    res.send()
})

app.post('/', jsonParser, (req, res) => {
    addNewBooking(req.body)
    res.send()
})
app.get("/*", (req, res) => {
    res.send('Not Allowed')
})

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server listening on port ${process.env.PORT || 3000}!`);
});