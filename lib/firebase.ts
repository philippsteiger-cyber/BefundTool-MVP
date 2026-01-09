import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, collection, doc, getDoc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { Template } from './types';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function initializeFirebase(): { app: FirebaseApp | null; db: Firestore | null } {
  if (typeof window === 'undefined') {
    return { app: null, db: null };
  }

  if (app && db) {
    return { app, db };
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const hasAllKeys = Object.values(firebaseConfig).every(val => val && val.trim() !== '');

  if (!hasAllKeys) {
    console.warn('Firebase environment variables not configured. Using local storage fallback.');
    return { app: null, db: null };
  }

  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    db = getFirestore(app);
    return { app, db };
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return { app: null, db: null };
  }
}

export async function getSystemPrompt(): Promise<string | null> {
  const { db } = initializeFirebase();
  if (!db) return null;

  try {
    const docRef = doc(db, 'settings', 'systemPrompt');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data().prompt || null;
    }
    return null;
  } catch (error) {
    console.error('Error fetching system prompt from Firebase:', error);
    return null;
  }
}

export async function saveSystemPrompt(prompt: string): Promise<boolean> {
  const { db } = initializeFirebase();
  if (!db) return false;

  try {
    const docRef = doc(db, 'settings', 'systemPrompt');
    await setDoc(docRef, {
      prompt,
      updatedAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.error('Error saving system prompt to Firebase:', error);
    return false;
  }
}

export async function loadTemplatesFromFirebase(): Promise<Template[]> {
  const { db } = initializeFirebase();
  if (!db) return [];

  try {
    const querySnapshot = await getDocs(collection(db, 'templates'));
    const templates: Template[] = [];

    querySnapshot.forEach((doc) => {
      templates.push(doc.data() as Template);
    });

    return templates;
  } catch (error) {
    console.error('Error loading templates from Firebase:', error);
    return [];
  }
}

export async function saveTemplateToFirebase(template: Template): Promise<boolean> {
  const { db } = initializeFirebase();
  if (!db) return false;

  try {
    const docRef = doc(db, 'templates', template.id);
    await setDoc(docRef, template);
    return true;
  } catch (error) {
    console.error('Error saving template to Firebase:', error);
    return false;
  }
}

export async function deleteTemplateFromFirebase(templateId: string): Promise<boolean> {
  const { db } = initializeFirebase();
  if (!db) return false;

  try {
    const docRef = doc(db, 'templates', templateId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Error deleting template from Firebase:', error);
    return false;
  }
}

export function isFirebaseConfigured(): boolean {
  return app !== null && db !== null;
}
