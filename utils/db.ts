import { AppState, INITIAL_WORDS_LIST, WordData } from '../types';

const DB_NAME = 'VocabMasterDB';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

const DEFAULT_STATE: AppState = {
  words: [], 
  streak: 0,
  lastLoginDate: '',
  dailyGoal: 20,
  dailyProgress: 0,
  darkMode: false
};

export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const getStoredState = async (): Promise<AppState> => {
  await initDB();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get('root');

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          resolve(getRequest.result);
        } else {
          // If fresh DB, seed with initial list immediately
          const seededState = seedInitialData(DEFAULT_STATE);
          saveStoredState(seededState); // Save it so next time it's there
          resolve(seededState);
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
};

export const saveStoredState = async (state: AppState): Promise<void> => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(state, 'root');
  };
};

// Helper to handle the seeding logic centrally
const seedInitialData = (state: AppState): AppState => {
   const existingWordSet = new Set(state.words.map(w => w.word.toLowerCase()));
   const newWordsToAdd = INITIAL_WORDS_LIST.filter(w => !existingWordSet.has(w.toLowerCase()));
   
   if (newWordsToAdd.length === 0) return state;

   const additionalWords: WordData[] = newWordsToAdd.map((w, i) => ({
      id: `seed-${Date.now()}-${i}`,
      word: w,
      definitions: [],
      examples: [],
      synonyms: [],
      etymology: '',
      aiMnemonic: '',
      mastered: false,
      leitnerBox: 0,
      nextReviewDate: 0
    }));

    return { ...state, words: [...state.words, ...additionalWords] };
};