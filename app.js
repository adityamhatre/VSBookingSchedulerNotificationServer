import express from 'express';
import admin from 'firebase-admin';
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid';

import cron from 'node-cron'

import JSJoda from '@js-joda/core'

const app = express()
const jsonParser = bodyParser.json()

const serviceAccount = JSON.parse(process.env.service_account_json)
const databaseURL = process.env.firebase_rtdb_url


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseURL
});

const toValidPattern = localDateTime => {
    return `${localDateTime}:00+05:30`
}

const notifyBookingIsTomorrow = event => {
    console.log(event)
    // admin.firestore().collection('bookings').doc(event.bookingIdOnGoogle).update({ notified: true })
}


const twoDigit = (number) => {
    return number < 10 ? `0${number}` : `${number}`
}


var month = new Array();
month[0] = "January";
month[1] = "February";
month[2] = "March";
month[3] = "April";
month[4] = "May";
month[5] = "June";
month[6] = "July";
month[7] = "August";
month[8] = "September";
month[9] = "October";
month[10] = "November";
month[11] = "December";
const toMonthName = (monthNumber) => {
    return month[monthNumber - 1]
}
const checkBookings = time => {
    const today = JSJoda.LocalDate.now(JSJoda.ZoneOffset.ofHoursMinutes(5, 30))
    const tomorrow = today.plusDays(1)

    const t = time === 930 ? '09:30 AM' : time === 1730 ? '05:30 PM' : '09:30 AM'
    const checkingFor = `${twoDigit(tomorrow.dayOfMonth())} ${toMonthName(tomorrow.monthValue())} ${tomorrow.year()}, ${t}`
    admin.firestore().collection('bookings')
        .where('checkIn', '==', checkingFor)
        .where('notified', '==', false).get()
        .then(docs => {
            docs.forEach(doc => notifyBookingIsTomorrow(doc.data()))
        }, err => { console.error(err) })
}

const checkAndNotifyBookings = time => { //time = 930, 1730
    console.log('tick')
    checkBookings(time)
}

const sendNotificationToTopic = (topic, data) => {
    const notification = {}
    if (topic === 'new-booking-topic') {
        notification['title'] = `New booking for ${data.bookingMainPerson}`
    }
    if (topic === 'updated-booking-topic') {
        notification['title'] = `Booking updated for ${data.bookingMainPerson}`
    }

    notification['body'] = `From ${data.checkIn} to ${data.checkOut}`
    notification['click_action'] = '.MainActivity'
    notification['icon'] = 'icon'

    const message = {
        topic,
        android: { notification },
        data: {
            ...data,
            topic,
            notificationId: uuidv4(),
        }
    };
    admin.messaging().send(message)
        .then((response) => {
            console.log('Successfully sent message:', response);
        })
        .catch((error) => {
            console.log('Error sending message:', error);
        });
}


const createBookingInFirestore = data => {
    const id = data.bookingIdOnGoogle
    data['notified'] = false
    admin.firestore().collection('bookings').doc(id).set(data)
}
const updateBookingInFirestore = data => {
    const id = data.bookingIdOnGoogle
    data['notified'] = false
    admin.firestore().collection('bookings').doc(id).update({...data})
}

const deleteBookingInFirestore = data => {
    const id = data.bookingIdOnGoogle
    admin.firestore().collection('bookings').doc(id).delete()
}

app.post('/notifications/newBookingCreated', jsonParser, (req, res) => {
    const topic = 'new-booking-topic';
    sendNotificationToTopic(topic, req.body)
    createBookingInFirestore(req.body)
    res.send()
})

app.post('/notifications/updatedBooking', jsonParser, (req, res) => {
    const topic = 'updated-booking-topic';
    sendNotificationToTopic(topic, req.body)
    updateBookingInFirestore(req.body) 
    res.send()
})

app.post('/deleteBooking', jsonParser, (req, res) => {
    deleteBookingInFirestore(req.body)
    res.send()
})

app.get('/checkForUpdates', (req, res) => {
    const db = admin.database()
    db.ref('/latestBuild').once('value', snap => {
        const obj = snap.val()
        const latestBuild = {
            buildNumber: obj.value,
            downloadLink: obj.link
        }
        res.send(latestBuild)
    })
})

app.get('/availability', (req, res) => {
    const checkIn = req.query.checkIn
    const checkOut = req.query.checkOut

    if (!(checkIn && checkOut)) {
        res.status(400).send('Both check in and check out times are required')
    }

    res.send(`${checkIn} -> ${checkOut}`)

})

app.get('/*', (req, res) => {
    res.send('Not Allowed')
})

app.listen(process.env.PORT || 80, () => {
    console.log(`Server listening on port ${process.env.PORT || 80}!`);
});

const cronExpression930 = '1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51,53,55,57,59 * * * *'//'30 9 * * *'
const cronExpression1730 = '0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58 * * * *'//'30 17 * * *'
cron.schedule(cronExpression930, () => checkAndNotifyBookings(930), { timezone: 'Asia/Kolkata' })
cron.schedule(cronExpression1730, () => checkAndNotifyBookings(1730), { timezone: 'Asia/Kolkata' })
setInterval(() => {
    const currentTime = JSJoda.LocalDateTime.now(JSJoda.ZoneOffset.ofHoursMinutes(5, 30))
    console.log(currentTime.toString())
}, 1000)


























