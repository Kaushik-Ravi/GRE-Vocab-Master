import React, { useState, useEffect } from 'react';
import { WordData } from '../types';
import { validateSentence, generateWordImage } from '../services/geminiService';
import { 
  SpeakerWaveIcon, 
  LightBulbIcon, 
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  PhotoIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface FlashcardProps {
  wordData: WordData;
  onUpdateMnemonic: (id: string, mnemonic: string) => void;
  onUpdateImage: (id: string, base64: string) => void;
  onNext: (mastered: boolean) => void;
}

const Flashcard: React.FC<FlashcardProps> = ({ wordData, onUpdateMnemonic, onUpdateImage, onNext }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeTab, setActiveTab] = useState<'def' | 'context' | 'mnemonic' | 'practice'>('def');
  const [userSentence, setUserSentence] = useState('');
  const [validationResult, setValidationResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [userMnemonicInput, setUserMnemonicInput] = useState(wordData.userMnemonic || '');
  const [isSavingMnemonic, setIsSavingMnemonic] = useState(false);
  
  // Image Generation State
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // When word changes, reset key states (though component key in App usually handles this)
  useEffect(() => {
     setUserMnemonicInput(wordData.userMnemonic || '');
  }, [wordData]);

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    const utterance = new SpeechSynthesisUtterance(wordData.word);
    window.speechSynthesis.speak(utterance);
  };

  const handleValidate = async () => {
    if (!userSentence.trim()) return;
    setIsValidating(true);
    const result = await validateSentence(wordData.word, userSentence);
    setValidationResult(result);
    setIsValidating(false);
  };

  const handleSaveMnemonic = () => {
    setIsSavingMnemonic(true);
    onUpdateMnemonic(wordData.id, userMnemonicInput);
    setTimeout(() => setIsSavingMnemonic(false), 500);
  };

  const handleGenerateImage = async () => {
     if (isGeneratingImage) return;
     setIsGeneratingImage(true);
     // Use user mnemonic if available, else AI mnemonic
     const promptContext = userMnemonicInput || wordData.aiMnemonic || `A visual mnemonic for ${wordData.word}`;
     const imageBase64 = await generateWordImage(wordData.word, promptContext);
     
     if (imageBase64) {
         onUpdateImage(wordData.id, imageBase64);
     } else {
         alert("Could not generate image right now. Please try again.");
     }
     setIsGeneratingImage(false);
  };

  return (
    // Responsive container height: 60vh on mobile to prevent scrolling off-screen, fixed taller height on desktop
    <div className="w-full max-w-2xl mx-auto h-[60vh] min-h-[400px] md:h-[600px] perspective-1000 my-4 md:my-8 relative">
      <div 
        className={`relative w-full h-full text-center transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
      >
        {/* FRONT OF CARD */}
        <div 
          onClick={() => setIsFlipped(true)}
          className="absolute w-full h-full backface-hidden bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl shadow-xl flex flex-col items-center justify-center cursor-pointer hover:shadow-2xl transition-shadow group overflow-hidden"
        >
          <span className="text-sm uppercase tracking-widest text-slate-500 mb-4 font-semibold">Tap to Reveal</span>
          <h2 className="text-4xl md:text-6xl font-serif font-bold text-slate-900 dark:text-white group-hover:scale-110 transition-transform duration-300 px-4">
            {wordData.word}
          </h2>
          <button 
            onClick={handleSpeak}
            className="mt-8 p-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 transition-colors z-10"
          >
            <SpeakerWaveIcon className="w-6 h-6" />
          </button>
        </div>

        {/* BACK OF CARD */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden flex flex-col text-left">
          {/* Header - Fixed */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 md:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0 z-20">
             <div className="flex items-center gap-3 overflow-hidden">
               <h2 className="text-2xl md:text-3xl font-serif font-bold text-slate-900 dark:text-white truncate">{wordData.word}</h2>
               <button onClick={handleSpeak} className="text-slate-500 hover:text-slate-700 shrink-0">
                 <SpeakerWaveIcon className="w-5 h-5" />
               </button>
             </div>
             <span className="text-xs font-mono text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded truncate max-w-[80px] md:max-w-[120px] ml-2 shrink-0">
               {wordData.etymology ? 'Derived from ' + wordData.etymology.split(' ').slice(0, 3).join(' ') + '...' : 'Etymology'}
             </span>
          </div>

          {/* Navigation - Fixed */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 overflow-x-auto hide-scrollbar z-20">
            <button 
              onClick={() => setActiveTab('def')}
              className={`flex-1 py-3 px-2 text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'def' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Definitions
            </button>
            <button 
              onClick={() => setActiveTab('context')}
              className={`flex-1 py-3 px-2 text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'context' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Context
            </button>
            <button 
              onClick={() => setActiveTab('mnemonic')}
              className={`flex-1 py-3 px-2 text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'mnemonic' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Memory
            </button>
            <button 
              onClick={() => setActiveTab('practice')}
              className={`flex-1 py-3 px-2 text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'practice' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Practice
            </button>
          </div>

          {/* Content Area - SCROLLABLE INTERNAL */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
            {activeTab === 'def' && (
              <div className="space-y-4 md:space-y-6">
                {wordData.definitions.length === 0 ? (
                    <div className="text-center text-slate-500 italic mt-8 flex flex-col items-center">
                        <ArrowPathIcon className="w-8 h-8 animate-spin mb-2 opacity-50"/>
                        <p>Fetching definitions...</p>
                    </div>
                ) : (
                    wordData.definitions.map((def, idx) => (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border-l-4 border-indigo-400">
                        <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1 block">{def.contextType}</span>
                        <p className="text-slate-700 dark:text-slate-200 text-base md:text-lg leading-relaxed">{def.definition}</p>
                    </div>
                    ))
                )}
                
                {wordData.synonyms.length > 0 && (
                    <div className="mt-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase mb-2">Synonyms</h4>
                    <div className="flex flex-wrap gap-2">
                        {wordData.synonyms.map((syn, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-sm">
                            {syn}
                        </span>
                        ))}
                    </div>
                    </div>
                )}
              </div>
            )}

            {activeTab === 'context' && (
              <div className="space-y-4 md:space-y-6">
                <p className="text-sm text-slate-500 italic mb-4">
                  Real-world usage examples mimicking high-quality journalism.
                </p>
                {wordData.examples.map((ex, idx) => (
                  <blockquote key={idx} className="relative pl-4 border-l-2 border-slate-300 dark:border-slate-600">
                    <p className="text-slate-800 dark:text-slate-200 text-base md:text-lg font-serif italic mb-2">
                      "{ex.text}"
                    </p>
                    <cite className="block text-sm font-bold text-slate-500 not-italic">
                      — {ex.source}
                    </cite>
                  </blockquote>
                ))}
                {wordData.examples.length === 0 && (
                   <div className="text-center text-slate-400 py-8">No examples available yet.</div>
                )}
              </div>
            )}

            {activeTab === 'mnemonic' && (
              <div className="space-y-4 md:space-y-6">
                {/* Visual Mnemonic Section */}
                <div className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 p-5 rounded-xl text-center">
                    {wordData.aiImageUrl ? (
                        <div className="mb-4">
                            <img src={wordData.aiImageUrl} alt="Mnemonic Visual" className="w-full h-40 md:h-48 object-contain rounded-lg bg-white" />
                            <p className="text-xs text-slate-400 mt-2">AI Generated Visualization</p>
                        </div>
                    ) : (
                        <div className="mb-4">
                            <div className="w-full h-24 md:h-32 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600">
                                <PhotoIcon className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                            </div>
                        </div>
                    )}
                    
                    {!wordData.aiImageUrl && (
                        <button 
                            onClick={handleGenerateImage}
                            disabled={isGeneratingImage}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isGeneratingImage ? <ArrowPathIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4"/>}
                            Generate Visual Memory
                        </button>
                    )}
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 p-5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400 font-bold">
                    <LightBulbIcon className="w-5 h-5" />
                    <span>AI Mnemonic</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 font-medium text-base md:text-lg">{wordData.aiMnemonic || "Loading mnemonic..."}</p>
                </div>

                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 rounded-xl">
                   <div className="flex items-center gap-2 mb-3 text-slate-700 dark:text-slate-300 font-bold">
                    <PencilSquareIcon className="w-5 h-5" />
                    <span>My Custom Mnemonic</span>
                  </div>
                  <textarea 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none placeholder-slate-400"
                    rows={3}
                    placeholder="Write your own story or hook here..."
                    value={userMnemonicInput}
                    onChange={(e) => setUserMnemonicInput(e.target.value)}
                  />
                  <button 
                    onClick={handleSaveMnemonic}
                    className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                  >
                    {isSavingMnemonic ? "Saved!" : "Save Mnemonic"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'practice' && (
              <div className="flex flex-col min-h-0">
                <p className="text-slate-600 dark:text-slate-400 mb-4">Write a sentence using <span className="font-bold">"{wordData.word}"</span>. Our AI will grade it.</p>
                <textarea 
                  className="w-full p-4 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-base md:text-lg placeholder-slate-400 min-h-[100px]"
                  placeholder="Type your sentence here..."
                  value={userSentence}
                  onChange={(e) => setUserSentence(e.target.value)}
                />
                <button 
                  onClick={handleValidate}
                  disabled={isValidating || !userSentence}
                  className="mt-4 w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                >
                  {isValidating ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Check My Sentence</>
                  )}
                </button>

                {validationResult && (
                  <div className={`mt-4 p-4 rounded-lg border ${validationResult.isCorrect ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                    <div className="flex items-start gap-3">
                      {validationResult.isCorrect ? (
                        <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
                      ) : (
                        <XCircleIcon className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
                      )}
                      <div>
                        <p className={`font-bold ${validationResult.isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                          {validationResult.isCorrect ? 'Correct Usage!' : 'Needs Improvement'}
                        </p>
                        <p className="text-sm mt-1 text-slate-700 dark:text-slate-300">{validationResult.feedback}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Bottom Padding spacer to ensure content isn't hidden behind footer */}
            <div className="h-12"></div>
          </div>

          {/* Action Footer - Fixed */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex gap-4 shrink-0 z-20">
            <button 
              onClick={() => {
                setIsFlipped(false);
                setValidationResult(null);
                setUserSentence('');
                setActiveTab('def');
                setTimeout(() => onNext(false), 300); // Wait for flip back
              }}
              className="flex-1 py-3 rounded-xl border-2 border-amber-500 text-amber-600 dark:text-amber-400 font-bold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              Review Later
            </button>
            <button 
              onClick={() => {
                setIsFlipped(false);
                setValidationResult(null);
                setUserSentence('');
                setActiveTab('def');
                setTimeout(() => onNext(true), 300);
              }}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 transition-all transform active:scale-95"
            >
              Mastered It!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Flashcard;