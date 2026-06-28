/* AI GM — Firebase bootstrap (ES module). Loaded last, after store.js and
 * store-cloud.js. Holds the public client config (security is enforced by
 * firestore.rules + Google Auth, never by hiding these values). The Gemini key
 * still lives only in localStorage and never touches the cloud.
 *
 * On sign-in it attaches a live CloudStore to the Store façade and primes the
 * cloud index; on sign-out it detaches so cloud games fall back to local. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, writeBatch, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD0wlV0M5JX0tu0JWL8AXKP7WyGZIRbans',
  authDomain: 'aigm-cc686.firebaseapp.com',
  projectId: 'aigm-cc686',
  storageBucket: 'aigm-cc686.firebasestorage.app',
  messagingSenderId: '97010491332',
  appId: '1:97010491332:web:6f270e27ee2b3193bf0e91'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const fb = { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, onSnapshot };

/* Auth controls the rest of the app reaches via window (classic scripts). */
window.AIGMAuth = {
  available: true,
  signIn: function () { return signInWithPopup(auth, new GoogleAuthProvider()); },
  signOut: function () { return signOut(auth); },
  user: function () { return auth.currentUser; }
};

onAuthStateChanged(auth, async function (user) {
  if (user) {
    Store.attachCloud(window.makeCloudStore({ db: db, fb: fb, uid: user.uid }));
    /* lift this device's library into the cloud, then prime the cid -> backend
     * index so a cold deep-link to a cloud game resolves */
    try { await Store.mirrorLibraryToCloud(); } catch (e) { console.warn('[AI GM] library mirror failed', e); }
    try { await Store.listCampaigns(); } catch (e) { console.warn('[AI GM] cloud index prime failed', e); }
  } else {
    Store.attachCloud(null);
  }
  if (window.AIGM_onAuth) window.AIGM_onAuth(user || null);
});
