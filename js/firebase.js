// js/firebase.js — Configuration Firebase partagée
// Importé par app.js ET par les modules qui ont besoin d'accès direct à Firestore/Auth

import { initializeApp }                                            from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth }                                                  from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// ── Mode hors ligne : cache IndexedDB ──
// Les données restent lisibles même sans connexion internet
// La synchronisation reprend automatiquement quand la connexion revient
enableIndexedDbPersistence(dbFirestore).catch((err) => {
    if (err.code === 'failed-precondition') {
        // Plusieurs onglets ouverts — le cache ne fonctionne que dans un seul onglet à la fois
        console.error('Cache hors ligne désactivé : plusieurs onglets ouverts');
    } else if (err.code === 'unimplemented') {
        // Navigateur ne supporte pas IndexedDB (rare)
        console.error('Cache hors ligne non supporté par ce navigateur');
    }
});
