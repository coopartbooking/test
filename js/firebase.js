// firebase.js — Configuration Firebase partagée
import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth }          from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, onSnapshot, deleteDoc }
                            from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyD_Cu2VR2YhFMOB65-5155d2hFVaHymGwU",
    authDomain:        "bob-coop-art.firebaseapp.com",
    projectId:         "bob-coop-art",
    storageBucket:     "bob-coop-art.firebasestorage.app",
    messagingSenderId: "215864119388",
    appId:             "1:215864119388:web:fc1ff1e282a82e607c1699"
};

const firebaseApp  = initializeApp(firebaseConfig);
export const auth         = getAuth(firebaseApp);
export const dbFirestore  = getFirestore(firebaseApp);
export { doc, setDoc, getDoc, getDocs, collection, onSnapshot, deleteDoc };

export const DEFAULT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
