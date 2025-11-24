// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDYtt3iFEYYF_HWBBwrU-RzeNJOP2fzAD8",
    authDomain: "volunteerapp-74ebe.firebaseapp.com",
    projectId: "volunteerapp-74ebe",
    storageBucket: "volunteerapp-74ebe.firebasestorage.app",
    messagingSenderId: "750355942660",
    appId: "1:750355942660:web:0ecfaeb57d588674f35451",
    measurementId: "G-JVT4EX7ZMQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
