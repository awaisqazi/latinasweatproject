import { db } from './galaFirebase';
import { collection, doc, getDocs, updateDoc, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Collection References
const GUESTS_COLLECTION = 'gala_guests';
const DONATIONS_COLLECTION = 'gala_donations';

// --- Guests ---

export const subscribeToGuests = (callback) => {
    const q = query(collection(db, GUESTS_COLLECTION), orderBy('paddleNumber'));
    return onSnapshot(q, (snapshot) => {
        const guests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(guests);
    });
};

export const updateGuest = async (guestId, data) => {
    const guestRef = doc(db, GUESTS_COLLECTION, guestId);
    await updateDoc(guestRef, data);
};

// --- Donations ---

export const subscribeToDonations = (callback) => {
    const q = query(collection(db, DONATIONS_COLLECTION), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const donations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(donations);
    });
};

export const addDonation = async (donationData) => {
    await addDoc(collection(db, DONATIONS_COLLECTION), {
        ...donationData,
        timestamp: serverTimestamp()
    });
};
