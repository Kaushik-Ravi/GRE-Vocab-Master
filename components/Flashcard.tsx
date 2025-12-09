import React, { useState, useRef } from 'react';
import { WordData } from '../types';
import { validateSentence } from '../services/geminiService';
import { 
  SpeakerWaveIcon, 
  LightBulbIcon, 
  BookOpenIcon, 
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface FlashcardProps {
  wordData: WordData;
  onUpdateMnemonic: (id: string, mnemonic: string) => void;
  onNext: (mastered: boolean) => void;
}

const Flashcard: React.FC<FlashcardProps> = ({ wordData, onUpdateMnemonic, onNext }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeTab, setActiveTab] = useState<'def' | 'context' | 'mnemonic' | 'practice'>('def');
  const [userSentence, setUserSentence] = useState('');
  const [validationResult, setValidationResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [userMnemonicInput, setUserMnemonicInput] = useState(wordData.userMnemonic || '');
  const [isSavingMnemonic, setIsSavingMnemonic] = useState(false);

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

  return (
    <div className="w-full max-w-2xl mx-auto h-[600px] perspective-1000 my-8">
      <div 
        className={`relative w-full h-full text-center transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
      >
        {/* FRONT OF CARD */}
        <div 
          onClick={() => setIsFlipped(true)}
          className="absolute w-full h-full backface-hidden bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl shadow-xl flex flex-col items-center justify-center cursor-pointer hover:shadow-2xl transition-shadow group"
        >
          <span className="text-sm uppercase tracking-widest text-slate-500 mb-4 font-semibold">Tap to Reveal</span>
          <h2 className="text-6xl font-serif font-bold text-slate-900 dark:text-white group-hover:scale-110 transition-transform duration-300">
            {wordData.word}
          </h2>
          <button 
            onClick={handleSpeak}
            className="mt-8 p-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 transition-colors"
          >
            <SpeakerWaveIcon className="w-6 h-6" />
          </button>
        </div>

        {/* BACK OF CARD */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden flex flex-col text-left">
          {/* Header */}
          <div className="bg-slate-50 dark:bg-slate-900 p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
             <div className="flex items-center gap-3">
               <h2 className="text-3xl font-serif font-bold text-slate-900 dark:text-white">{wordData.word}</h2>
               <button onClick={handleSpeak} className="text-slate-500 hover:text-slate-700">
                 <SpeakerWaveIcon className="w-5 h-5" />
               </button>
             </div>
             <span className="text-xs font-mono text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">
               {wordData.etymology ? 'Derived from ' + wordData.etymology.split(' ').slice(0, 3).join(' ') + '...' : 'Etymology'}
             </span>
          </div>

          {/* Navigation */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button 
              onClick={() => setActiveTab('def')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'def' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Definitions
            </button>
            <button 
              onClick={() => setActiveTab('context')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'context' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Context (NYT)
            </button>
            <button 
              onClick={() => setActiveTab('mnemonic')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'mnemonic' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Memory
            </button>
            <button 
              onClick={() => setActiveTab('practice')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'practice' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Practice
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {activeTab === 'def' && (
              <div className="space-y-6">
                {wordData.definitions.map((def, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border-l-4 border-indigo-400">
                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1 block">{def.contextType}</span>
                    <p className="text-slate-700 dark:text-slate-200 text-lg leading-relaxed">{def.definition}</p>
                  </div>
                ))}
                
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
              </div>
            )}

            {activeTab === 'context' && (
              <div className="space-y-6">
                <p className="text-sm text-slate-500 italic mb-4">
                  Real-world usage examples mimicking high-quality journalism.
                </p>
                {wordData.examples.map((ex, idx) => (
                  <blockquote key={idx} className="relative pl-4 border-l-2 border-slate-300 dark:border-slate-600">
                    <p className="text-slate-800 dark:text-slate-200 text-lg font-serif italic mb-2">
                      "{ex.text}"
                    </p>
                    <cite className="block text-sm font-bold text-slate-500 not-italic">
                      — {ex.source}
                    </cite>
                  </blockquote>
                ))}
              </div>
            )}

            {activeTab === 'mnemonic' && (
              <div className="space-y-8">
                <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3 text-amber-700 font-bold">
                    <LightBulbIcon className="w-5 h-5" />
                    <span>AI Mnemonic</span>
                  </div>
                  <p className="text-slate-800 font-medium text-lg">{wordData.aiMnemonic}</p>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-xl">
                   <div className="flex items-center gap-2 mb-3 text-slate-700 font-bold">
                    <PencilSquareIcon className="w-5 h-5" />
                    <span>My Custom Mnemonic</span>
                  </div>
                  <textarea 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    rows={3}
                    placeholder="Write your own story or hook here..."
                    value={userMnemonicInput}
                    onChange={(e) => setUserMnemonicInput(e.target.value)}
                  />
                  <button 
                    onClick={handleSaveMnemonic}
                    className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    {isSavingMnemonic ? "Saved!" : "Save Mnemonic"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'practice' && (
              <div className="flex flex-col h-full">
                <p className="text-slate-600 dark:text-slate-400 mb-4">Write a sentence using <span className="font-bold">"{wordData.word}"</span>. Our AI will grade it.</p>
                <textarea 
                  className="flex-1 p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-lg"
                  placeholder="Type your sentence here..."
                  value={userSentence}
                  onChange={(e) => setUserSentence(e.target.value)}
                />
                <button 
                  onClick={handleValidate}
                  disabled={isValidating || !userSentence}
                  className="mt-4 w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isValidating ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Check My Sentence</>
                  )}
                </button>

                {validationResult && (
                  <div className={`mt-4 p-4 rounded-lg border ${validationResult.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start gap-3">
                      {validationResult.isCorrect ? (
                        <CheckCircleIcon className="w-6 h-6 text-green-600 shrink-0" />
                      ) : (
                        <XCircleIcon className="w-6 h-6 text-red-600 shrink-0" />
                      )}
                      <div>
                        <p className={`font-bold ${validationResult.isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                          {validationResult.isCorrect ? 'Correct Usage!' : 'Needs Improvement'}
                        </p>
                        <p className="text-sm mt-1 text-slate-700">{validationResult.feedback}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex gap-4">
            <button 
              onClick={() => {
                setIsFlipped(false);
                setValidationResult(null);
                setUserSentence('');
                setActiveTab('def');
                setTimeout(() => onNext(false), 300); // Wait for flip back
              }}
              className="flex-1 py-3 rounded-xl border-2 border-amber-500 text-amber-600 font-bold hover:bg-amber-50 transition-colors"
            >
              Review Later (Missed)
            </button>
            <button 
              onClick={() => {
                setIsFlipped(false);
                setValidationResult(null);
                setUserSentence('');
                setActiveTab('def');
                setTimeout(() => onNext(true), 300);
              }}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform active:scale-95"
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