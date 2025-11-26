// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDNynhowfHNzqpMfIkL8EbeJVulOaopslU",
    authDomain: "galathermometerapp.firebaseapp.com",
    projectId: "galathermometerapp",
    storageBucket: "galathermometerapp.firebasestorage.app",
    messagingSenderId: "321633239354",
    appId: "1:321633239354:web:00f19c9d3307b184939003"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig, "galaApp"); // Give it a name to avoid conflicts
export const db = getFirestore(app);
export const auth = getAuth(app);
