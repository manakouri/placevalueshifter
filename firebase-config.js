// firebase-config.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// TODO: Replace with your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAakXPbECFWlXMjG-EpB5_NSPcDWK0BkjY",
  authDomain: "place-value-shifter.firebaseapp.com",
  projectId: "place-value-shifter",
  storageBucket: "place-value-shifter.firebasestorage.app",
  messagingSenderId: "388817467603",
  appId: "1:388817467603:web:26f323802399f959dd7c26",
  measurementId: "G-TMZC74RWR2"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // <-- Initialize Auth

export { db, auth }; // <-- Export auth


