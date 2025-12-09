import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Flashcard from './components/Flashcard';
import { fetchWordDetails, getDailyReadings } from './services/geminiService';
import { AppState, ViewState, WordData, ReadingArticle } from './types';
import { getStoredState, saveStoredState } from './utils/db';
import { calculateNextReview, getReviewQueue } from './utils/srs';
import { PlusIcon, BookOpenIcon, ArrowPathIcon, MagnifyingGlassIcon, CheckBadgeIcon, PlayCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ClockIcon } from '@heroicons/react/24/outline';

// Constants
const WORDS_PER_SET = 30;
const CONCURRENCY_LIMIT = 3; // Limit parallel fetches to avoid rate limits

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState | null>(null); // Null while loading DB
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  
  // Study Session State
  const [studyQueue, setStudyQueue] = useState<WordData[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isLoadingWord, setIsLoadingWord] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });

  // Reading State
  const [articles, setArticles] = useState<ReadingArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // New Word Input
  const [newWordInput, setNewWordInput] = useState('');
  
  // Library State
  const [librarySearch, setLibrarySearch] = useState('');

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
        
        // Apply Dark Mode
        if (newState.darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        setAppState(newState);
      } catch (e) {
        console.error("Failed to load DB", e);
        // Fallback or error state could go here
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

  const prepareStudySession = useCallback(async (targetWords: WordData[]) => {
    if (!appState) return;
    if (targetWords.length === 0) {
      alert("No words selected to study.");
      return;
    }

    setIsLoadingWord(true);
    setLoadingProgress({ current: 0, total: targetWords.length });
    
    // THROTTLED BATCH PROCESSING
    let processedWords: WordData[] = [];
    const wordsToProcess = [...targetWords];
    
    // Helper to process a single word
    const processWord = async (w: WordData): Promise<WordData> => {
       if (w.definitions.length === 0) {
         try {
           const details = await fetchWordDetails(w.word);
           return { ...w, ...details } as WordData;
         } catch (e) {
           console.error(`Failed to fetch details for ${w.word}`);
           return w; // Return original (incomplete) word on error
         }
       }
       return w;
    };

    // Processing Loop
    for (let i = 0; i < wordsToProcess.length; i += CONCURRENCY_LIMIT) {
        const chunk = wordsToProcess.slice(i, i + CONCURRENCY_LIMIT);
        const chunkResults = await Promise.all(chunk.map(processWord));
        processedWords = [...processedWords, ...chunkResults];
        setLoadingProgress({ current: Math.min(i + CONCURRENCY_LIMIT, wordsToProcess.length), total: wordsToProcess.length });
    }

    // Save the enriched data back to DB immediately so we never lose it
    const newWordsMap = new Map(appState.words.map(w => [w.id, w]));
    processedWords.forEach(pw => newWordsMap.set(pw.id, pw));
    const updatedWords = Array.from(newWordsMap.values());
    
    const nextState = { ...appState, words: updatedWords };
    await saveStoredState(nextState);
    setAppState(nextState);
    
    setStudyQueue(processedWords);
    setCurrentCardIndex(0);
    setSessionComplete(false);
    setIsLoadingWord(false);
    setCurrentView(ViewState.STUDY);
  }, [appState]);

  const startSetSession = (setIndex: number) => {
    if (!appState) return;
    const start = setIndex * WORDS_PER_SET;
    const end = start + WORDS_PER_SET;
    
    const seededWords = appState.words.filter(w => w.id.startsWith('seed-'));
    const setWords = seededWords.slice(start, end);
    
    // Prioritize unmastered words or words with no SRS data
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
     await saveStoredState(newState); // Save to DB
  };

  const loadReadings = async () => {
    setLoadingArticles(true);
    const arts = await getDailyReadings();
    setArticles(arts);
    setLoadingArticles(false);
  };

  const handleAddWord = async () => {
    if (!newWordInput.trim() || !appState) return;
    setIsLoadingWord(true);
    try {
        const details = await fetchWordDetails(newWordInput);
        const newWord: WordData = {
            id: `custom-${Date.now()}`,
            word: newWordInput,
            definitions: details.definitions || [],
            examples: details.examples || [],
            synonyms: details.synonyms || [],
            etymology: details.etymology || '',
            aiMnemonic: details.aiMnemonic || '',
            mastered: false,
            leitnerBox: 0,
            nextReviewDate: 0
        };
        
        const newState = { ...appState, words: [...appState.words, newWord] };
        setAppState(newState);
        await saveStoredState(newState); // Save to DB
        setNewWordInput('');
        alert(`"${newWordInput}" added to your deck!`);
    } catch(e) {
        alert("Could not find that word. Please try again.");
    } finally {
        setIsLoadingWord(false);
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
                    // Basic validation
                    if (!parsedData.words || typeof parsedData.streak !== 'number') {
                        throw new Error("Invalid file format");
                    }
                    
                    const confirmLoad = window.confirm(`Found backup with ${parsedData.words.length} words (Streak: ${parsedData.streak}). Overwrite current data?`);
                    if (confirmLoad) {
                        setAppState(parsedData);
                        await saveStoredState(parsedData);
                        alert("Data successfully restored!");
                    }
                } catch (error) {
                    alert("Error parsing backup file. Please ensure it is a valid JSON file from this app.");
                    console.error(error);
                }
            }
        };
    }
  };

  if (!appState) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <div className="flex flex-col items-center">
                <ArrowPathIcon className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Initializing Database...</p>
              </div>
          </div>
      );
  }

  // VIEWS
  const renderDashboard = () => {
    const seededWords = appState.words.filter(w => w.id.startsWith('seed-'));
    const totalSets = Math.ceil(seededWords.length / WORDS_PER_SET);
    const reviewQueue = getReviewQueue(appState.words);

    return (
      <div className="space-y-8 animate-fade-in">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-8 text-white shadow-xl flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-serif font-bold mb-2">My Word Sets</h1>
              <p className="opacity-90 text-lg">Master the GRE vocabulary, one set at a time.</p>
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
                            {isLoadingWord ? <ArrowPathIcon className="w-4 h-4 animate-spin"/> : <PlayCircleIcon className="w-5 h-5" />}
                            Study Set
                        </button>
                    </div>
                );
            })}
        </div>
        
        {/* Custom Words Section */}
        <div className="bg-slate-800 dark:bg-slate-950 rounded-2xl p-6 text-white mt-12">
            <h3 className="font-bold text-lg mb-4">Add Custom Words</h3>
            <div className="flex gap-4">
                <input 
                  type="text" 
                  value={newWordInput}
                  onChange={(e) => setNewWordInput(e.target.value)}
                  placeholder="e.g. Obsequious"
                  className="flex-1 p-3 bg-slate-700 dark:bg-slate-900 border border-slate-600 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-white placeholder-slate-400"
                />
                <button 
                    onClick={handleAddWord}
                    disabled={isLoadingWord}
                    className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 font-bold px-6"
                >
                    {isLoadingWord ? <ArrowPathIcon className="w-6 h-6 animate-spin"/> : "Add Word"}
                </button>
            </div>
        </div>
      </div>
    );
  };

  const renderLibrary = () => {
    // Filter words based on search
    const filteredWords = appState.words.filter(w => 
        w.word.toLowerCase().includes(librarySearch.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                   <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-white">Word Library</h1>
                   <p className="text-slate-500 dark:text-slate-400">Browse all {appState.words.length} words in your collection.</p>
                </div>
                <div className="relative">
                    <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search for a word..." 
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                        className="pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 text-slate-900 dark:text-white"
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-left">
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
                                    No words found matching "{librarySearch}"
                                </td>
                            </tr>
                        ) : (
                            filteredWords.map((word) => (
                                <tr key={word.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="font-serif font-bold text-slate-800 dark:text-white text-lg">{word.word}</span>
                                        {word.definitions.length > 0 && (
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
                                                Level {word.leitnerBox}
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
                                            onClick={() => prepareStudySession([word])}
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
    );
  };

  const renderStudy = () => {
    if (isLoadingWord) {
      return (
         <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500 dark:text-slate-400">
           <ArrowPathIcon className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
           <p className="text-lg font-medium">Curating your customized flashcards...</p>
           <p className="text-sm">Fetching real-time data from Oxford & NYT...</p>
           {loadingProgress.total > 0 && (
               <div className="mt-4 w-64 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                   <div 
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                   />
               </div>
           )}
           <p className="text-xs text-slate-400 mt-2">Processed {loadingProgress.current} of {loadingProgress.total}</p>
         </div>
      );
    }
    
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
    
    return (
      <div className="flex flex-col items-center">
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
            key={currentWord.id} // Key ensures reset on change
            wordData={currentWord} 
            onUpdateMnemonic={handleMnemonicUpdate} 
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
          <div className="max-w-3xl mx-auto">
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
          <div className="max-w-xl mx-auto animate-fade-in">
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