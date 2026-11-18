// js/firebase.js — Configuration Firebase partagée
// Importé par app.js ET par les modules qui ont besoin d'accès direct à Firestore/Auth

import { initializeApp }                                            from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { initializeAuth, getAuth,
         indexedDBLocalPersistence, browserLocalPersistence }        from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage }   from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey:            "AIzaSyD_Cu2VR2YhFMOB65-5155d2hFVaHymGwU",
    authDomain:        "bob-coop-art.firebaseapp.com",
    projectId:         "bob-coop-art",
    storageBucket:     "bob-coop-art.firebasestorage.app",
    messagingSenderId: "215864119388",
    appId:             "1:215864119388:web:fc1ff1e282a82e607c1699"
};

export const firebaseApp = initializeApp(firebaseConfig);

// ─────────────────────────────────────────────────────────────────────────────
// Auth initialisé SANS popupRedirectResolver.
//
// Bob n'utilise que la connexion email/mot de passe : aucune fenêtre surgissante
// (Google, Facebook…). Or getAuth() prépare ce mécanisme par défaut, ce qui
// déclenche le chargement de https://apis.google.com — bloqué par notre CSP,
// et inutile. On l'évite à la source plutôt que d'élargir la CSP.
//
// ⚠️ Le try/catch est indispensable : ce module est importé sous plusieurs URL
// (avec et sans ?v=N), donc évalué plusieurs fois par le navigateur. Le second
// passage récupère l'instance déjà créée au lieu de lever "already-initialized".
//
// Si un jour tu ajoutes une connexion Google, il faudra repasser à getAuth()
// (ou fournir browserPopupRedirectResolver) ET autoriser dans la CSP :
//     script-src  https://apis.google.com
//     frame-src   https://apis.google.com https://bob-coop-art.firebaseapp.com
// ─────────────────────────────────────────────────────────────────────────────
let _auth;
try {
    _auth = initializeAuth(firebaseApp, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
} catch (e) {
    _auth = getAuth(firebaseApp);
}

export const auth        = _auth;
export const dbFirestore = getFirestore(firebaseApp);
export const dbStorage   = getStorage(firebaseApp);
