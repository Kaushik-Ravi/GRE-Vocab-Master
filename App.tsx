import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Flashcard from './components/Flashcard';
import { fetchWordDetails, getDailyReadings } from './services/geminiService';
import { AppState, ViewState, WordData, ReadingArticle } from './types';
import { getStoredState, saveStoredState } from './utils/db';
import { calculateNextReview, getReviewQueue } from './utils/srs';
import { 
  PlusIcon, BookOpenIcon, ArrowPathIcon, MagnifyingGlassIcon, 
  CheckBadgeIcon, PlayCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, 
  ClockIcon, FunnelIcon, SparklesIcon, TrophyIcon, BeakerIcon, UserIcon,
  DocumentPlusIcon
} from '@heroicons/react/24/outline';

// Constants
const WORDS_PER_SET = 30;

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState | null>(null); // Null while loading DB
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  
  // Study Session State
  const [studyQueue, setStudyQueue] = useState<WordData[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isLoadingWord, setIsLoadingWord] = useState(false);

  // Reading State
  const [articles, setArticles] = useState<ReadingArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // New Word Input
  const [newWordInput, setNewWordInput] = useState('');
  const [fetchImmediately, setFetchImmediately] = useState(false);
  const [isAddingWords, setIsAddingWords] = useState(false);
  const [addWordsStatus, setAddWordsStatus] = useState<string>('');
  
  // Library State
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'mastered' | 'learning' | 'new' | 'custom'>('all');

  // Initialization from DB
  useEffect(() => {
    const init = async () => {
      try {
        const loadedState = await getStoredState();
        
        // Check Streak logic
        const today = new Date().toDateString();
        let newState = { ...loadedState };

        if (loadedState.lastLoginDate !== today) {
            let newStreak = loadedState.streak;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (loadedState.lastLoginDate === yesterday.toDateString()) {
                 newStreak += 1;
            } else if (loadedState.lastLoginDate !== '' && loadedState.lastLoginDate !== today) {
                 newStreak = 1; // Reset if broken
            } else if (loadedState.lastLoginDate === '') {
                 newStreak = 1; // First login
            }

            newState = { ...newState, lastLoginDate: today, streak: newStreak, dailyProgress: 0 };
            await saveStoredState(newState);
        }
        
        // Apply Dark Mode Immediately
        if (newState.darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        setAppState(newState);
      } catch (e) {
        console.error("Failed to load DB", e);
      }
    };
    init();
  }, []);

  const toggleDarkMode = async () => {
    if (!appState) return;
    const newMode = !appState.darkMode;
    if (newMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    const newState = { ...appState, darkMode: newMode };
    setAppState(newState);
    await saveStoredState(newState);
  };

  // Lazy Loading Effect for Study Session
  useEffect(() => {
     if (currentView !== ViewState.STUDY || studyQueue.length === 0) return;

     const loadCard = async (index: number) => {
         const word = studyQueue[index];
         // Only fetch if details are missing (definitions array empty)
         if (word && word.definitions.length === 0) {
             if (index === currentCardIndex) setIsLoadingWord(true);
             
             try {
                 const details = await fetchWordDetails(word.word);
                 const updatedWord = { ...word, ...details } as WordData;
                 
                 // Update Queue
                 setStudyQueue(prev => {
                     const newQ = [...prev];
                     if (newQ[index] && newQ[index].id === word.id) {
                         newQ[index] = updatedWord;
                     }
                     return newQ;
                 });

                 // Update Persistent State (in background)
                 setAppState(prev => {
                     if (!prev) return null;
                     const newWords = prev.words.map(w => w.id === word.id ? updatedWord : w);
                     const newState = { ...prev, words: newWords };
                     saveStoredState(newState); // Save to DB
                     return newState;
                 });
             } catch (e) {
                 console.error("Failed to load word details", e);
             } finally {
                 if (index === currentCardIndex) setIsLoadingWord(false);
             }
         }
     };

     // Load current card
     loadCard(currentCardIndex);
     
     // Pre-load next card in background
     if (currentCardIndex + 1 < studyQueue.length) {
         loadCard(currentCardIndex + 1);
     }
  }, [currentCardIndex, currentView, studyQueue]);


  const prepareStudySession = useCallback((targetWords: WordData[]) => {
    if (targetWords.length === 0) {
      alert("No words selected to study.");
      return;
    }
    // Just set the queue, the useEffect handles loading details "on the fly"
    setStudyQueue(targetWords);
    setCurrentCardIndex(0);
    setSessionComplete(false);
    setCurrentView(ViewState.STUDY);
  }, []);

  const startSetSession = (setIndex: number) => {
    if (!appState) return;
    const start = setIndex * WORDS_PER_SET;
    const end = start + WORDS_PER_SET;
    
    const seededWords = appState.words.filter(w => w.id.startsWith('seed-'));
    const setWords = seededWords.slice(start, end);
    
    let toStudy = setWords.filter(w => w.leitnerBox === 0 || !w.mastered);
    
    if (toStudy.length === 0) {
         const confirmReview = window.confirm("You have started all words in this set! Review all?");
         if (confirmReview) toStudy = setWords;
         else return;
    }
    
    prepareStudySession(toStudy);
  };

  const startReviewSession = () => {
    if (!appState) return;
    const reviewQueue = getReviewQueue(appState.words);
    prepareStudySession(reviewQueue);
  };

  const startCustomSession = (type: 'mastered' | 'learning' | 'custom') => {
      if (!appState) return;
      let words: WordData[] = [];
      
      if (type === 'mastered') {
          words = appState.words.filter(w => w.mastered);
      } else if (type === 'learning') {
          words = appState.words.filter(w => !w.mastered && w.leitnerBox > 0);
      } else if (type === 'custom') {
          // Updated filter: Includes explicitly custom words AND manual adds
          words = appState.words.filter(w => w.isCustom || w.id.startsWith('custom-'));
      }

      if (words.length === 0) {
          alert("No words found in this category yet!");
          return;
      }
      
      // Shuffle but DO NOT slice - User requested ALL words
      const shuffled = words.sort(() => 0.5 - Math.random());
      prepareStudySession(shuffled);
  };

  const handleCardNext = async (isCorrect: boolean) => {
    if (!appState) return;
    const currentWord = studyQueue[currentCardIndex];
    
    // Calculate new SRS state
    const { box, nextReview } = calculateNextReview(currentWord.leitnerBox || 0, isCorrect);
    const isMastered = box >= 5;

    const updatedWords = appState.words.map(w => w.id === currentWord.id ? { 
        ...w, 
        leitnerBox: box, 
        nextReviewDate: nextReview,
        mastered: isMastered,
        lastReview: Date.now() 
    } : w);

    const newState = { 
        ...appState, 
        words: updatedWords, 
        dailyProgress: appState.dailyProgress + 1 
    };
    
    setAppState(newState);
    await saveStoredState(newState);

    if (currentCardIndex < studyQueue.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
    } else {
      setSessionComplete(true);
    }
  };

  const handleMnemonicUpdate = async (id: string, mnemonic: string) => {
     if (!appState) return;
     const updatedWords = appState.words.map(w => w.id === id ? { ...w, userMnemonic: mnemonic } : w);
     const newState = { ...appState, words: updatedWords };
     setAppState(newState);
     await saveStoredState(newState); 
  };

  const handleImageUpdate = async (id: string, base64: string) => {
      if (!appState) return;
      const updatedWords = appState.words.map(w => w.id === id ? { ...w, aiImageUrl: base64 } : w);
      const newState = { ...appState, words: updatedWords };
      setAppState(newState);
      await saveStoredState(newState);
  };

  const loadReadings = async () => {
    setLoadingArticles(true);
    const arts = await getDailyReadings();
    setArticles(arts);
    setLoadingArticles(false);
  };

  const handleBulkAddWords = async () => {
    if (!newWordInput.trim() || !appState) return;
    setIsAddingWords(true);
    setAddWordsStatus('Parsing list...');

    try {
        // Parse input: split by commas or newlines, remove empty/whitespace
        const rawWords = newWordInput.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
        
        if (rawWords.length === 0) {
            setIsAddingWords(false);
            return;
        }

        const uniqueInputs = Array.from(new Set(rawWords)) as string[];
        const totalToProcess = uniqueInputs.length;
        
        // Clone current state for modification
        let updatedWords = [...appState.words];
        // Create a quick lookup map
        const wordIndexMap = new Map(updatedWords.map((w, i) => [w.word.toLowerCase(), i]));
        
        let processedCount = 0;
        let fetchedCount = 0;

        for (const wordStr of uniqueInputs) {
            processedCount++;
            const wordLower = wordStr.toLowerCase();
            let wordData: WordData;
            let isNew = false;
            let index = -1;

            if (wordIndexMap.has(wordLower)) {
                // EXISTING WORD
                index = wordIndexMap.get(wordLower)!;
                wordData = { ...updatedWords[index] };
                // CRITICAL: Always mark as custom if user added it manually
                wordData.isCustom = true; 
            } else {
                // NEW WORD
                isNew = true;
                wordData = {
                    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    word: wordStr,
                    definitions: [],
                    examples: [],
                    synonyms: [],
                    etymology: '',
                    aiMnemonic: '',
                    mastered: false,
                    isCustom: true,
                    leitnerBox: 0,
                    nextReviewDate: 0
                };
            }

            // FETCH LOGIC
            // If user checked "Fetch Immediately", we fetch if definitions are missing.
            // This applies to both NEW words and EXISTING words (if they have no defs).
            if (fetchImmediately && wordData.definitions.length === 0) {
                 setAddWordsStatus(`Fetching definition for "${wordStr}" (${processedCount}/${totalToProcess})...`);
                 try {
                     const details = await fetchWordDetails(wordStr);
                     wordData = { ...wordData, ...details };
                     fetchedCount++;
                 } catch (e) {
                     console.warn(`Could not fetch details for ${wordStr} immediately. Will retry later.`);
                 }
            } else {
                 setAddWordsStatus(`Processing "${wordStr}" (${processedCount}/${totalToProcess})...`);
            }

            // UPDATE ARRAY
            if (isNew) {
                updatedWords.push(wordData);
                wordIndexMap.set(wordLower, updatedWords.length - 1);
            } else {
                updatedWords[index] = wordData;
            }
        }

        // Save State
        const newState = { ...appState, words: updatedWords };
        setAppState(newState);
        await saveStoredState(newState);

        setNewWordInput('');
        alert(`Success! Processed ${totalToProcess} words.\nFetched definitions for ${fetchedCount} words.\nAll added to your 'Custom' list.`);

    } catch(e) {
        console.error(e);
        alert("An error occurred while adding words.");
    } finally {
        setIsAddingWords(false);
        setAddWordsStatus('');
    }
  };

  // Export/Import Handlers
  const handleExportData = () => {
    if (!appState) return;
    const dataStr = JSON.stringify(appState);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `gre-vocab-master-backup-${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files.length > 0) {
        fileReader.readAsText(event.target.files[0], "UTF-8");
        fileReader.onload = async (e) => {
            if (e.target && typeof e.target.result === 'string') {
                try {
                    const parsedData = JSON.parse(e.target.result) as AppState;
                    if (!parsedData.words || typeof parsedData.streak !== 'number') {
                        throw new Error("Invalid file format");
                    }
                    const confirmLoad = window.confirm(`Found backup with ${parsedData.words.length} words. Overwrite?`);
                    if (confirmLoad) {
                        setAppState(parsedData);
                        await saveStoredState(parsedData);
                        alert("Data successfully restored!");
                    }
                } catch (error) {
                    alert("Error parsing backup file.");
                    console.error(error);
                }
            }
        };
    }
  };

  if (!appState) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
              <div className="flex flex-col items-center">
                <ArrowPathIcon className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">Initializing Database...</p>
              </div>
          </div>
      );
  }

  // VIEWS
  const renderDashboard = () => {
    const seededWords = appState.words.filter(w => w.id.startsWith('seed-'));
    const totalSets = Math.ceil(seededWords.length / WORDS_PER_SET);
    const reviewQueue = getReviewQueue(appState.words);

    // Custom count includes anything with isCustom flag OR legacy custom ID
    const customCount = appState.words.filter(w => w.isCustom || w.id.startsWith('custom-')).length;
    const masteredCountTotal = appState.words.filter(w => w.mastered).length;
    const learningCount = appState.words.filter(w => !w.mastered && w.leitnerBox > 0).length;

    return (
      <div className="space-y-8 animate-fade-in pb-20">
        
        {/* Bulk Add Custom Words Section */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <DocumentPlusIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
               </div>
               <div>
                 <h3 className="font-bold text-lg text-slate-800 dark:text-white">Add Custom Words</h3>
                 <p className="text-xs text-slate-500 dark:text-slate-400">Bulk import list. Separate with commas or new lines.</p>
               </div>
            </div>
            
            <div className="flex flex-col gap-3">
                <textarea 
                  value={newWordInput}
                  onChange={(e) => setNewWordInput(e.target.value)}
                  placeholder="e.g. Obsequious, Iconoclast, \nMercurial..."
                  rows={3}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white placeholder-slate-400 resize-none font-medium"
                />
                
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none group w-full sm:w-auto">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${fetchImmediately ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                            {fetchImmediately && <CheckBadgeIcon className="w-4 h-4 text-white" />}
                        </div>
                        <input 
                           type="checkbox" 
                           className="hidden" 
                           checked={fetchImmediately} 
                           onChange={(e) => setFetchImmediately(e.target.checked)} 
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">Auto-fetch meanings? <span className="text-xs opacity-60">(Slower)</span></span>
                    </label>

                    <button 
                        onClick={handleBulkAddWords}
                        disabled={isAddingWords || !newWordInput.trim()}
                        className="w-full sm:w-auto py-2.5 px-6 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 font-bold whitespace-nowrap flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-indigo-200 dark:shadow-none"
                    >
                        {isAddingWords ? (
                           <>
                             <ArrowPathIcon className="w-5 h-5 animate-spin"/>
                             <span>Adding...</span>
                           </>
                        ) : (
                           <>
                             <PlusIcon className="w-5 h-5" />
                             <span>Add Words</span>
                           </>
                        )}
                    </button>
                </div>
                {addWordsStatus && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium animate-pulse text-center sm:text-right">
                        {addWordsStatus}
                    </p>
                )}
            </div>
        </div>

        {/* Header Stats */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-8 text-white shadow-xl flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-serif font-bold mb-2">My Word Sets</h1>
              <p className="opacity-90 text-lg">Master the GRE vocabulary.</p>
            </div>
            <div className="text-right">
                 <div className="text-3xl font-bold">{appState.dailyProgress} / {appState.dailyGoal}</div>
                 <div className="text-sm opacity-75">Daily Cards</div>
            </div>
        </div>

        {/* SRS Review Section */}
        {reviewQueue.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl p-6 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 dark:bg-amber-800 rounded-full text-amber-600 dark:text-amber-200">
                        <ClockIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-amber-900 dark:text-amber-100">Review Due</h3>
                        <p className="text-amber-700 dark:text-amber-300 text-sm">
                            {reviewQueue.length} words need your attention today.
                        </p>
                    </div>
                </div>
                <button 
                    onClick={startReviewSession}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md transition-colors"
                >
                    Start Review
                </button>
            </div>
        )}

        {/* Smart Decks */}
        <div>
           <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
             <SparklesIcon className="w-6 h-6 text-purple-500" />
             Smart Decks
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {/* Revision Deck */}
               <div 
                  onClick={() => startCustomSession('mastered')}
                  className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 p-6 rounded-2xl cursor-pointer hover:shadow-md transition-all group"
               >
                   <div className="w-12 h-12 bg-green-100 dark:bg-green-800 rounded-xl flex items-center justify-center text-green-600 dark:text-green-300 mb-4 group-hover:scale-110 transition-transform">
                       <TrophyIcon className="w-7 h-7" />
                   </div>
                   <h3 className="font-bold text-slate-900 dark:text-white text-lg">Revision</h3>
                   <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{masteredCountTotal} Mastered Words</p>
               </div>

               {/* Learning Pile */}
               <div 
                  onClick={() => startCustomSession('learning')}
                  className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 p-6 rounded-2xl cursor-pointer hover:shadow-md transition-all group"
               >
                   <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-300 mb-4 group-hover:scale-110 transition-transform">
                       <BeakerIcon className="w-7 h-7" />
                   </div>
                   <h3 className="font-bold text-slate-900 dark:text-white text-lg">In Progress</h3>
                   <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{learningCount} Words Learning</p>
               </div>

               {/* Custom Words */}
               <div 
                  onClick={() => startCustomSession('custom')}
                  className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/50 p-6 rounded-2xl cursor-pointer hover:shadow-md transition-all group"
               >
                   <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-800 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-300 mb-4 group-hover:scale-110 transition-transform">
                       <UserIcon className="w-7 h-7" />
                   </div>
                   <h3 className="font-bold text-slate-900 dark:text-white text-lg">My Custom Words</h3>
                   <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{customCount} Words Created</p>
               </div>
           </div>
        </div>
        
        {/* Seeded Sets */}
        <div>
           <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Course Material (Randomized Mix)</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: totalSets }).map((_, idx) => {
                  const start = idx * WORDS_PER_SET;
                  const setWords = seededWords.slice(start, start + WORDS_PER_SET);
                  const masteredCount = setWords.filter(w => w.mastered).length;
                  const progress = (masteredCount / setWords.length) * 100;
                  
                  return (
                      <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
                          <div className="flex justify-between items-start mb-4">
                              <div>
                                  <h3 className="text-lg font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Set {idx + 1}</h3>
                                  <p className="text-xs text-slate-400 font-medium">{setWords.length} Words</p>
                              </div>
                              {progress === 100 ? (
                                  <CheckBadgeIcon className="w-8 h-8 text-green-500" />
                              ) : (
                                  <div className="w-8 h-8 rounded-full border-2 border-slate-100 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                      {idx + 1}
                                  </div>
                              )}
                          </div>
                          
                          <div className="mb-4">
                              <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                                  <span>{Math.round(progress)}% Mastered</span>
                                  <span>{masteredCount}/{setWords.length}</span>
                              </div>
                              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${progress === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                                      style={{ width: `${progress}%` }}
                                  />
                              </div>
                          </div>
                          
                          <button 
                              onClick={() => startSetSession(idx)}
                              disabled={isLoadingWord}
                              className="w-full py-3 rounded-xl bg-slate-50 dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
                          >
                              <PlayCircleIcon className="w-5 h-5" />
                              Study Set
                          </button>
                      </div>
                  );
              })}
           </div>
        </div>
      </div>
    );
  };

  const renderLibrary = () => {
    // Filter Logic
    const filteredWords = appState.words.filter(w => {
        const matchesSearch = w.word.toLowerCase().includes(librarySearch.toLowerCase());
        if (!matchesSearch) return false;

        switch (libraryFilter) {
            case 'mastered': return w.mastered;
            case 'learning': return !w.mastered && w.leitnerBox > 0;
            case 'new': return !w.mastered && w.leitnerBox === 0;
            case 'custom': return w.isCustom || w.id.startsWith('custom-');
            default: return true;
        }
    });

    const filters: { id: typeof libraryFilter, label: string }[] = [
        { id: 'all', label: 'All Words' },
        { id: 'mastered', label: 'Mastered' },
        { id: 'learning', label: 'In Progress' },
        { id: 'new', label: 'Untouched' },
        { id: 'custom', label: 'My Custom Words' }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-white">Word Library</h1>
                        <p className="text-slate-500 dark:text-slate-400">Manage your collection.</p>
                    </div>
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Search..." 
                            value={librarySearch}
                            onChange={(e) => setLibrarySearch(e.target.value)}
                            className="pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 text-slate-900 dark:text-white"
                        />
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setLibraryFilter(f.id)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all ${
                                libraryFilter === f.id 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-4 font-bold text-sm text-slate-500 dark:text-slate-400 uppercase">Word</th>
                                <th className="px-6 py-4 font-bold text-sm text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                <th className="px-6 py-4 font-bold text-sm text-slate-500 dark:text-slate-400 uppercase">Mnemonic</th>
                                <th className="px-6 py-4 font-bold text-sm text-slate-500 dark:text-slate-400 uppercase text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredWords.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <FunnelIcon className="w-8 h-8 opacity-20" />
                                            <p>No words found for this filter.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredWords.map((word) => (
                                    <tr key={word.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-serif font-bold text-slate-800 dark:text-white text-lg">{word.word}</span>
                                                {word.isCustom && <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">C</span>}
                                            </div>
                                            {word.definitions && word.definitions.length > 0 && (
                                                <p className="text-xs text-slate-500 truncate max-w-xs mt-1">
                                                    {word.definitions[0].definition}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {word.mastered ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                                    <CheckBadgeIcon className="w-3 h-3" /> Mastered
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                                                    {word.leitnerBox === 0 ? 'New' : `Level ${word.leitnerBox}`}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {word.userMnemonic ? (
                                                <span className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Custom</span>
                                            ) : (
                                                <span className="text-sm text-slate-400">--</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => {
                                                    setStudyQueue([word]);
                                                    setCurrentCardIndex(0);
                                                    setSessionComplete(false);
                                                    setCurrentView(ViewState.STUDY);
                                                }}
                                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm font-bold"
                                            >
                                                Study
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };

  const renderStudy = () => {
    if (sessionComplete) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                <BookOpenIcon className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-3xl font-serif font-bold text-slate-800 dark:text-white mb-2">Session Complete!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">Great job. You've reviewed {studyQueue.length} words. Keep up the streak to move them to long-term memory.</p>
            <button 
                onClick={() => setCurrentView(ViewState.DASHBOARD)}
                className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
            >
                Back to Dashboard
            </button>
        </div>
      );
    }

    if (studyQueue.length === 0) return <div>No cards loaded.</div>;

    const currentWord = studyQueue[currentCardIndex];
    
    // Check if current word is loading
    if (isLoadingWord) {
         return (
             <div className="flex flex-col items-center justify-center h-[60vh]">
                 <ArrowPathIcon className="w-16 h-16 text-indigo-500 animate-spin mb-6" />
                 <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Fetching Data...</h2>
                 <p className="text-slate-500 dark:text-slate-400 mt-2">Connecting to Dictionary API</p>
             </div>
         );
    }

    return (
      <div className="flex flex-col items-center pb-20">
         <div className="w-full flex justify-between items-center mb-4 text-sm font-medium text-slate-400">
            <span>Card {currentCardIndex + 1} of {studyQueue.length}</span>
            <span>Set Progress</span>
         </div>
         <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full mb-8">
            <div 
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${((currentCardIndex + 1) / studyQueue.length) * 100}%` }}
            />
         </div>
         <Flashcard 
            key={currentWord.id} 
            wordData={currentWord} 
            onUpdateMnemonic={handleMnemonicUpdate} 
            onUpdateImage={handleImageUpdate}
            onNext={handleCardNext} 
         />
      </div>
    );
  };

  const renderReading = () => {
      // Lazy load articles
      if (articles.length === 0 && !loadingArticles) {
          loadReadings();
      }

      return (
          <div className="max-w-3xl mx-auto pb-20">
             <div className="mb-8 border-b border-slate-200 dark:border-slate-800 pb-6">
                <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-white mb-2">Arts & Letters Daily Picks</h1>
                <p className="text-slate-500 dark:text-slate-400">
                    Curated daily readings to improve your GRE reading comprehension. 
                    Focus on complex sentence structures and unfamiliar topics.
                </p>
             </div>

             {loadingArticles ? (
                 <div className="space-y-6">
                     {[1,2,3].map(i => (
                         <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm animate-pulse">
                             <div className="h-6 bg-slate-200 dark:bg-slate-700 w-3/4 rounded mb-4"></div>
                             <div className="h-4 bg-slate-200 dark:bg-slate-700 w-full rounded mb-2"></div>
                             <div className="h-4 bg-slate-200 dark:bg-slate-700 w-1/2 rounded"></div>
                         </div>
                     ))}
                 </div>
             ) : (
                 <div className="space-y-6">
                     {articles.map((article, idx) => (
                         <div key={idx} className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group">
                             <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 block">{article.source}</span>
                             <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-white mb-3 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                                 <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
                             </h3>
                             <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{article.summary}</p>
                             <a 
                                href={article.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                             >
                                 Read Article &rarr;
                             </a>
                         </div>
                     ))}
                 </div>
             )}
          </div>
      );
  };

  const renderSettings = () => {
      return (
          <div className="max-w-xl mx-auto animate-fade-in pb-20">
             <div className="mb-8 border-b border-slate-200 dark:border-slate-800 pb-6">
                <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-white mb-2">Data Management</h1>
                <p className="text-slate-500 dark:text-slate-400">
                    Since this is a privacy-first app without a central server, your data lives on this device. 
                    Use Export/Import to move progress between devices (e.g., Laptop to Phone).
                </p>
             </div>

             <div className="space-y-6">
                 {/* Export Section */}
                 <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                     <div className="flex items-start gap-4 mb-6">
                         <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
                            <ArrowDownTrayIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                         </div>
                         <div>
                             <h3 className="text-xl font-bold text-slate-800 dark:text-white">Backup / Export</h3>
                             <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Download your progress, mastered words, and mnemonics as a file.</p>
                         </div>
                     </div>
                     <button 
                        onClick={handleExportData}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
                     >
                        Download Backup File
                     </button>
                 </div>

                 {/* Import Section */}
                 <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                     <div className="flex items-start gap-4 mb-6">
                         <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl">
                            <ArrowUpTrayIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                         </div>
                         <div>
                             <h3 className="text-xl font-bold text-slate-800 dark:text-white">Restore / Import</h3>
                             <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Load a backup file. <span className="text-red-500 dark:text-red-400 font-bold">Warning:</span> This will overwrite current data.</p>
                         </div>
                     </div>
                     <div className="relative">
                        <input 
                            type="file" 
                            accept=".json"
                            onChange={handleImportData}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <button className="w-full py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 hover:border-indigo-300 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold rounded-xl transition-colors dashed">
                            Select Backup File to Upload
                        </button>
                     </div>
                 </div>
             </div>
          </div>
      );
  };

  return (
    <Layout 
      currentView={currentView} 
      onChangeView={setCurrentView} 
      streak={appState ? appState.streak : 0}
      isDarkMode={appState ? !!appState.darkMode : false}
      onToggleDarkMode={toggleDarkMode}
    >
       {currentView === ViewState.DASHBOARD && renderDashboard()}
       {currentView === ViewState.LIBRARY && renderLibrary()}
       {currentView === ViewState.STUDY && renderStudy()}
       {currentView === ViewState.READING && renderReading()}
       {currentView === ViewState.SETTINGS && renderSettings()}
    </Layout>
  );
};

export default App;