import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAiklc7ybCnbLne_rnCgJc2KUlv5Lff_go",
  authDomain: "budget-tracker-app-240ce.firebaseapp.com",
  projectId: "budget-tracker-app-240ce",
  storageBucket: "budget-tracker-app-240ce.firebasestorage.app",
  messagingSenderId: "334665840075",
  appId: "1:334665840075:web:6af0b6d49617c9de2c324e",
  measurementId: "G-ZB6JCSZVLW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
