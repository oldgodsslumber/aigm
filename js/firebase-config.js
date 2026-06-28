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
  collection, getDocs, writeBatch, onSnapshot,
  runTransaction, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
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
const fb = {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, onSnapshot,
  runTransaction, arrayUnion, arrayRemove
};

/* Mobile browsers routinely block or lose the sign-in popup, so use the
 * redirect flow there; keep the popup on desktop (no full-page reload) but fall
 * back to redirect if the popup is blocked or unsupported. */
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
function redirectIsBetter(e) {
  const s = (e && (e.code || e.message)) || '';
  return /popup-blocked|popup-closed-by-user|cancelled-popup-request|operation-not-supported-in-this-environment|web-storage-unsupported/i.test(s);
}

/* Auth + Firestore primitives the classic scripts reach via window. */
window.AIGMAuth = {
  available: true,
  signIn: async function () {
    const provider = new GoogleAuthProvider();
    if (IS_MOBILE) return signInWithRedirect(auth, provider); // navigates away; resolves via getRedirectResult on return
    try { return await signInWithPopup(auth, provider); }
    catch (e) {
      if (redirectIsBetter(e)) return signInWithRedirect(auth, provider);
      throw e;
    }
  },
  signOut: function () { return signOut(auth); },
  user: function () { return auth.currentUser; }
};

/* Complete a pending redirect sign-in when the page reloads back from Google.
 * onAuthStateChanged then fires with the signed-in user; this just surfaces
 * any error (e.g. unauthorized domain) instead of failing silently. */
getRedirectResult(auth).catch(function (e) {
  console.warn('[AI GM] redirect sign-in failed', e);
  if (window.AIGM_onAuthError) window.AIGM_onAuthError(e);
});

onAuthStateChanged(auth, async function (user) {
  if (user) {
    window.FirebaseCtx = { db: db, fb: fb, uid: user.uid };
    Store.attachCloud(window.makeCloudStore({ db: db, fb: fb, uid: user.uid }));
    /* shared adapter for multiplayer games rooted at games/{gameId} */
    Store.attachShared(window.makeCloudStore({ db: db, fb: fb, campaignsPath: ['games'] }));
    /* lift this device's library into the cloud, learn multiplayer memberships,
     * then prime the cid -> backend index so cold deep-links resolve */
    try { await Store.mirrorLibraryToCloud(); } catch (e) { console.warn('[AI GM] library mirror failed', e); }
    try { await Store.registerMemberships(); } catch (e) { console.warn('[AI GM] membership load failed', e); }
    try { await Store.listCampaigns(); } catch (e) { console.warn('[AI GM] cloud index prime failed', e); }
  } else {
    window.FirebaseCtx = null;
    Store.attachCloud(null);
    Store.attachShared(null);
  }
  if (window.AIGM_onAuth) window.AIGM_onAuth(user || null);
});
