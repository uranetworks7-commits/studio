// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBpvng4Am-rhTPwSvWKxAGN2WCqBwsoAaM",
  authDomain: "bitcoin-fa4b2.firebaseapp.com",
  databaseURL: "https://bitcoin-fa4b2-default-rtdb.firebaseio.com",
  projectId: "bitcoin-fa4b2",
  storageBucket: "bitcoin-fa4b2.firebasestorage.app",
  messagingSenderId: "311271969444",
  appId: "1:311271969444:web:7fb50ae0439b9bde600c31"
};

// Initialize Firebase
let app: FirebaseApp;
let db: Database;

try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (error) {
  console.error("Firebase initialization error", error);
}


export { app, db };
