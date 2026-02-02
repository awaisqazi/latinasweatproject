// Script to call the rebuildMonthlyAvailability Cloud Function
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyDYtt3iFEYYF_HWBBwrU-RzeNJOP2fzAD8",
    authDomain: "volunteerapp-74ebe.firebaseapp.com",
    projectId: "volunteerapp-74ebe",
    storageBucket: "volunteerapp-74ebe.firebasestorage.app",
    messagingSenderId: "750355942660",
    appId: "1:750355942660:web:0ecfaeb57d588674f35451",
    measurementId: "G-JVT4EX7ZMQ"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, "us-central1");

const rebuildMonthlyAvailability = httpsCallable(functions, "rebuildMonthlyAvailability");

console.log("Calling rebuildMonthlyAvailability...");

try {
    const result = await rebuildMonthlyAvailability();
    console.log("Success!", result.data);
} catch (error) {
    console.error("Error:", error.message);
}
