// js/firebase.js — Configuration Firebase partagée
// Importé par app.js ET par les modules qui ont besoin d'accès direct à Firestore/Auth

import { initializeApp }                                            from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth }                                                  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore }                                             from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyD_Cu2VR2YhFMOB65-5155d2hFVaHymGwU",
    authDomain:        "bob-coop-art.firebaseapp.com",
    projectId:         "bob-coop-art",
    storageBucket:     "bob-coop-art.firebasestorage.app",
    messagingSenderId: "215864119388",
    appId:             "1:215864119388:web:fc1ff1e282a82e607c1699"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth        = getAuth(firebaseApp);
export const dbFirestore = getFirestore(firebaseApp);
