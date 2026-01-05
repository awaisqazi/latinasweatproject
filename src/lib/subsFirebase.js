// Separate Firebase app for substitute tracking
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyALkOiyDT1MOySHU8cBFQk5nady8xLIymA",
    authDomain: "substracker-c0a34.firebaseapp.com",
    projectId: "substracker-c0a34",
    storageBucket: "substracker-c0a34.firebasestorage.app",
    messagingSenderId: "638440230596",
    appId: "1:638440230596:web:0ce7806d96d239a70b0391",
    measurementId: "G-4LBYMCDBJE"
};

// Use a unique app name to avoid conflicts with main firebase.js
const app = initializeApp(firebaseConfig, "subsTracker");
export const subsDb = getFirestore(app);
