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

const notifyBookingIsTomorrow = event => {
    const topic = 'tomorrow-booking-topic'
    admin.firestore().collection('bookings').doc(event.bookingIdOnGoogle).update({ notified: 'true' })
    sendNotificationToTopic(topic, event)
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

    const t = time === 930 ? '09:30 AM' : time === 1730 ? '05:30 PM' : time === 1600 ? '04:00 PM' : '09:30 AM'
    const checkingFor = `${twoDigit(tomorrow.dayOfMonth())} ${toMonthName(tomorrow.monthValue())} ${tomorrow.year()}, ${t}`

    admin.firestore().collection('bookings')
        .where('checkIn', '==', checkingFor)
        .where('notified', '==', 'false').get()
        .then(docs => {
            docs.forEach(doc => notifyBookingIsTomorrow(doc.data()))
        }, err => { console.error(err) })
}

const checkAndNotifyBookings = time => { //time = 930, 1730, 1600
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
    if (topic === 'tomorrow-booking-topic') {
        notification['title'] = `Tomorrow is ${data.bookingMainPerson}'s booking!`
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
    data['notified'] = 'false'
    admin.firestore().collection('bookings').doc(id).set(data)
}
const updateBookingInFirestore = data => {
    const id = data.bookingIdOnGoogle
    admin.firestore().collection('bookings').doc(id).update({ ...data })
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

app.listen(process.env.PORT || 80, () => {
    console.log(`Server listening on port ${process.env.PORT || 80}!`);
});

const cronExpression930 = '30 9 * * *'
const cronExpression1730 = '30 17 * * *'
const cronExpression1600 = '0 16 * * *'
cron.schedule(cronExpression930, () => checkAndNotifyBookings(930), { timezone: 'Asia/Kolkata' })
cron.schedule(cronExpression1730, () => checkAndNotifyBookings(1730), { timezone: 'Asia/Kolkata' })
cron.schedule(cronExpression1600, () => checkAndNotifyBookings(1600), { timezone: 'Asia/Kolkata' })

app.get('/notifyBooking/930', (req, res) => {
    checkAndNotifyBookings(930)
    res.send()
})
app.get('/notifyBooking/1730', (req, res) => {
    checkAndNotifyBookings(1730)
    res.send()
})
app.get('/notifyBooking/1600', (req, res) => {
    checkAndNotifyBookings(1600)
    res.send()
})


app.get('/*', (req, res) => {
    res.send('Not Allowed')
})

// https://console.cron-job.org/jobs
// if heroku sleeps, the above should wake it up at 9.30a, 4.00p, 5.30p

// =====> crap from here onwards
// setInterval(() => {
//     const currentTime = JSJoda.LocalDateTime.now(JSJoda.ZoneOffset.ofHoursMinutes(5, 30))
//     console.log(currentTime.toString())
// }, 1000)


const setupFirestore = () => {
    // admin.firestore().collection('bookings').add()
    const events = [
        {
            "51885d13-5f85-4a1b-b1f1-f1ef16ce2afe": {
                "bookingIdOnGoogle": "51885d13-5f85-4a1b-b1f1-f1ef16ce2afe",
                "accommodations": "Room 1 (Vihar), Room 2 (Vishava), Dormitory (Sobat), Dormitory (Sangat)",
                "checkIn": "09 January 2021, 09:30 AM",
                "checkOut": "10 January 2021, 09:00 AM",
                "bookingMainPerson": "हरीश",
                "totalNumberOfPeople": "25",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "15000",
                "phoneNumber": "9773971212",
                "notes": ""
            }
        },
        {
            "b84b2835-6e10-45e0-a5c7-b1e3a23468cc": {
                "bookingIdOnGoogle": "b84b2835-6e10-45e0-a5c7-b1e3a23468cc",
                "accommodations": "Bungalow (3 + 1), Special Room 1, Special Room 2",
                "checkIn": "09 January 2021, 09:30 AM",
                "checkOut": "10 January 2021, 05:00 PM",
                "bookingMainPerson": "गिरीश गुरव",
                "totalNumberOfPeople": "15",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "5000",
                "phoneNumber": "9619223055",
                "notes": ""
            }
        },
        {
            "f98f25d4-28e0-4e84-993e-0db1a50faddc": {
                "bookingIdOnGoogle": "f98f25d4-28e0-4e84-993e-0db1a50faddc",
                "accommodations": "Special Room 1, Special Room 2",
                "checkIn": "16 January 2021, 09:30 AM",
                "checkOut": "17 January 2021, 05:00 PM",
                "bookingMainPerson": "Milind Mhatre",
                "totalNumberOfPeople": "7",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "false",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "-1",
                "phoneNumber": "9820630832",
                "notes": ""
            }
        },
        {
            "ac67e202-85cc-4ff6-bcbd-d67bd5e14be4": {
                "bookingIdOnGoogle": "ac67e202-85cc-4ff6-bcbd-d67bd5e14be4",
                "accommodations": "Nivant",
                "checkIn": "16 January 2021, 05:30 PM",
                "checkOut": "17 January 2021, 05:00 PM",
                "bookingMainPerson": "Adesh Mondkar",
                "totalNumberOfPeople": "12",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Cheque",
                "advancedPaymentAmount": "5000",
                "phoneNumber": "7558363933",
                "notes": ""
            }
        },
        {
            "fe20b510-bce8-43f8-810c-2a995105655f": {
                "bookingIdOnGoogle": "fe20b510-bce8-43f8-810c-2a995105655f",
                "accommodations": "Dormitory (Sobat)",
                "checkIn": "16 January 2021, 05:30 PM",
                "checkOut": "17 January 2021, 05:00 PM",
                "bookingMainPerson": "Praful Chopde",
                "totalNumberOfPeople": "7",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "false",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "-1",
                "phoneNumber": "9881183618",
                "notes": ""
            }
        },
        {
            "14519510-1494-4912-a202-124c95901d18": {
                "bookingIdOnGoogle": "14519510-1494-4912-a202-124c95901d18",
                "accommodations": "One Day",
                "checkIn": "17 January 2021, 04:00 PM",
                "checkOut": "18 January 2021, 12:00 AM",
                "bookingMainPerson": "RM M Chaudhary",
                "totalNumberOfPeople": "20",
                "bookedBy": "Aditya Mhatre",
                "advancedPaymentReceived": "false",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "-1",
                "phoneNumber": "123456789",
                "notes": ""
            }
        },
        {
            "1d24765e-c434-4e91-839e-baab11d11143": {
                "bookingIdOnGoogle": "1d24765e-c434-4e91-839e-baab11d11143",
                "accommodations": "One Day",
                "checkIn": "21 January 2021, 04:00 PM",
                "checkOut": "22 January 2021, 12:00 AM",
                "bookingMainPerson": "Kiran kadam",
                "totalNumberOfPeople": "50",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "1500",
                "phoneNumber": "9766358857",
                "notes": ""
            }
        },
        {
            "102988e1-e067-490d-9b3e-82ef3ded8a22": {
                "bookingIdOnGoogle": "102988e1-e067-490d-9b3e-82ef3ded8a22",
                "accommodations": "One Day",
                "checkIn": "23 January 2021, 09:30 AM",
                "checkOut": "23 January 2021, 05:00 PM",
                "bookingMainPerson": "Falguni ",
                "totalNumberOfPeople": "11",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "2250",
                "phoneNumber": "9820314449",
                "notes": "With Room No.4"
            }
        },
        {
            "c328a272-7cc6-484c-8969-acfe244658b1": {
                "bookingIdOnGoogle": "c328a272-7cc6-484c-8969-acfe244658b1",
                "accommodations": "Bungalow (3 + 1), Special Room 1, Special Room 2, Room 1 (Vihar), Room 2 (Vishava), Room 3 (Vishram)",
                "checkIn": "23 January 2021, 09:30 AM",
                "checkOut": "24 January 2021, 09:00 AM",
                "bookingMainPerson": "Rajesh Mugatkar",
                "totalNumberOfPeople": "36",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "10000",
                "phoneNumber": "9820142750",
                "notes": "One extra heavy breakfast complimentary"
            }
        },
        {
            "ddd83f8e-1c4b-4c55-a91d-0f085d68ede9": {
                "bookingIdOnGoogle": "ddd83f8e-1c4b-4c55-a91d-0f085d68ede9",
                "accommodations": "Nivant",
                "checkIn": "23 January 2021, 05:30 PM",
                "checkOut": "24 January 2021, 05:00 PM",
                "bookingMainPerson": "Suchita Domale",
                "totalNumberOfPeople": "12",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "2000",
                "phoneNumber": "9769097534",
                "notes": ""
            }
        },
        {
            "791d5507-a8e5-456f-8026-870c075e468f": {
                "bookingIdOnGoogle": "791d5507-a8e5-456f-8026-870c075e468f",
                "accommodations": "Dormitory (Sangat)",
                "checkIn": "23 January 2021, 05:30 PM",
                "checkOut": "24 January 2021, 05:00 PM",
                "bookingMainPerson": "Ravikant Satu Gavas",
                "totalNumberOfPeople": "15",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "false",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "-1",
                "phoneNumber": "9869852713",
                "notes": ""
            }
        },
        {
            "90969a06-7332-4402-b780-5d220dc80f45": {
                "bookingIdOnGoogle": "90969a06-7332-4402-b780-5d220dc80f45",
                "accommodations": "Dormitory (Sobat)",
                "checkIn": "23 January 2021, 05:30 PM",
                "checkOut": "24 January 2021, 05:00 PM",
                "bookingMainPerson": "Dhanaji Sitaram Patekar",
                "totalNumberOfPeople": "10",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "10000",
                "phoneNumber": "9921834287",
                "notes": ""
            }
        },
        {
            "3d337c76-37e5-4e9f-b23d-dfdd3e3854dc": {
                "bookingIdOnGoogle": "3d337c76-37e5-4e9f-b23d-dfdd3e3854dc",
                "accommodations": "Room 1 (Vihar)",
                "checkIn": "24 January 2021, 09:30 AM",
                "checkOut": "25 January 2021, 05:00 PM",
                "bookingMainPerson": "Suyog Saple",
                "totalNumberOfPeople": "3",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "2000",
                "phoneNumber": "7666461213",
                "notes": "Rooms will be alloted 5.00 pm on 24/1/2021 rest room will be given "
            }
        },
        {
            "019ae84b-a2ec-42ce-b010-973c06d78be6": {
                "bookingIdOnGoogle": "019ae84b-a2ec-42ce-b010-973c06d78be6",
                "accommodations": "Dormitory (Sobat), Dormitory (Sangat)",
                "checkIn": "06 February 2021, 09:30 AM",
                "checkOut": "07 February 2021, 05:00 PM",
                "bookingMainPerson": "Nikhil Naringrekar",
                "totalNumberOfPeople": "25",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "10000",
                "phoneNumber": "9757093525",
                "notes": ""
            }
        },
        {
            "cf4224d7-e16b-4c08-9d45-92d8ce938607": {
                "bookingIdOnGoogle": "cf4224d7-e16b-4c08-9d45-92d8ce938607",
                "accommodations": "Bungalow (3 + 1)",
                "checkIn": "06 February 2021, 09:30 AM",
                "checkOut": "07 February 2021, 05:00 PM",
                "bookingMainPerson": "Sangita Shinde",
                "totalNumberOfPeople": "15",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "6000",
                "phoneNumber": "9867792192",
                "notes": ""
            }
        },
        {
            "9227e6e3-e1c5-4aa8-bf6d-2f3830bc35dc": {
                "bookingIdOnGoogle": "9227e6e3-e1c5-4aa8-bf6d-2f3830bc35dc",
                "accommodations": "One Day",
                "checkIn": "07 February 2021, 09:30 AM",
                "checkOut": "07 February 2021, 05:00 PM",
                "bookingMainPerson": "Umesh Pimple & Group",
                "totalNumberOfPeople": "20",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "2000",
                "phoneNumber": "9545998502",
                "notes": ""
            }
        },
        {
            "a135b23b-c767-4586-93ca-b1c0eac262b0": {
                "bookingIdOnGoogle": "a135b23b-c767-4586-93ca-b1c0eac262b0",
                "accommodations": "One Day",
                "checkIn": "09 February 2021, 09:30 AM",
                "checkOut": "09 February 2021, 05:00 PM",
                "bookingMainPerson": "Vishal Raut",
                "totalNumberOfPeople": "150",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "2000",
                "phoneNumber": "8968706446",
                "notes": "Birthday celebration location only"
            }
        },
        {
            "81ba21ee-1acc-443f-9efc-6957071ffa0f": {
                "bookingIdOnGoogle": "81ba21ee-1acc-443f-9efc-6957071ffa0f",
                "accommodations": "Bungalow (3 + 1), Special Room 1, Special Room 2, Room 1 (Vihar), Room 2 (Vishava), Room 3 (Vishram), Room 4 (Vishrant), Nivant, Dormitory (Sobat), Dormitory (Sangat), Big Lawn",
                "checkIn": "18 February 2021, 09:30 AM",
                "checkOut": "20 February 2021, 05:00 PM",
                "bookingMainPerson": "Raju Chaphekar",
                "totalNumberOfPeople": "100",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "5000",
                "phoneNumber": "56",
                "notes": ""
            }
        },
        {
            "40ff0beb-ecae-4017-ba51-58d9d91f5a11": {
                "bookingIdOnGoogle": "40ff0beb-ecae-4017-ba51-58d9d91f5a11",
                "accommodations": "One Day",
                "checkIn": "01 March 2021, 09:30 AM",
                "checkOut": "01 March 2021, 05:00 PM",
                "bookingMainPerson": "test one day booking",
                "totalNumberOfPeople": "12",
                "bookedBy": "Aditya Mhatre",
                "advancedPaymentReceived": "false",
                "advancedPaymentType": "Cash",
                "advancedPaymentAmount": "-1",
                "phoneNumber": "1234567890",
                "notes": ""
            }
        },
        {
            "a1dc0480-8d06-4e42-9d62-594ebfaca31d": {
                "bookingIdOnGoogle": "a1dc0480-8d06-4e42-9d62-594ebfaca31d",
                "accommodations": "Bungalow (3 + 1), Special Room 1, Special Room 2, Room 1 (Vihar), Room 2 (Vishava), Room 3 (Vishram), Room 4 (Vishrant), Nivant, Dormitory (Sobat), Dormitory (Sangat)",
                "checkIn": "23 April 2021, 09:30 AM",
                "checkOut": "24 April 2021, 09:00 AM",
                "bookingMainPerson": "Suchita Karvir",
                "totalNumberOfPeople": "100",
                "bookedBy": "Rajesh Mhatre",
                "advancedPaymentReceived": "true",
                "advancedPaymentType": "Bank Deposit",
                "advancedPaymentAmount": "5000",
                "phoneNumber": "7620472609",
                "notes": ""
            }
        }
    ]


    for (let event of events) {
        for (let docId in event) {
            admin.firestore().collection('bookings').doc(docId).set({ ...event[docId], notified: 'false' })
        }
    }
}
// setupFirestore()



















