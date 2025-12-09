import React from 'react';
import { ViewState } from '../types';
import { Cog6ToothIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  streak: number;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView, streak, isDarkMode, onToggleDarkMode }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => onChangeView(ViewState.DASHBOARD)}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-serif font-bold text-xl shadow-lg shadow-indigo-500/30">V</div>
              <span className="font-serif font-bold text-xl text-slate-800 dark:text-white tracking-tight">VocabMaster</span>
            </div>
            
            <div className="hidden md:flex space-x-8">
              <button 
                onClick={() => onChangeView(ViewState.DASHBOARD)}
                className={`text-sm font-medium transition-colors ${currentView === ViewState.DASHBOARD ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Word Sets
              </button>
              <button 
                onClick={() => onChangeView(ViewState.LIBRARY)}
                className={`text-sm font-medium transition-colors ${currentView === ViewState.LIBRARY ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Library
              </button>
              <button 
                onClick={() => onChangeView(ViewState.STUDY)}
                className={`text-sm font-medium transition-colors ${currentView === ViewState.STUDY ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Current Session
              </button>
              <button 
                onClick={() => onChangeView(ViewState.READING)}
                className={`text-sm font-medium transition-colors ${currentView === ViewState.READING ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Reading
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-800 text-sm font-bold">
                🔥 {streak}
              </div>
              
              <button
                onClick={onToggleDarkMode}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
              </button>

              <button 
                onClick={() => onChangeView(ViewState.SETTINGS)}
                className={`p-2 rounded-full transition-colors ${currentView === ViewState.SETTINGS ? 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'}`}
              >
                <Cog6ToothIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex justify-around items-center z-50 pb-safe">
         <button onClick={() => onChangeView(ViewState.DASHBOARD)} className={currentView === ViewState.DASHBOARD ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 font-bold text-xs'}>SETS</button>
         <button onClick={() => onChangeView(ViewState.LIBRARY)} className={currentView === ViewState.LIBRARY ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 font-bold text-xs'}>LIB</button>
         <button onClick={() => onChangeView(ViewState.STUDY)} className={currentView === ViewState.STUDY ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 font-bold text-xs'}>STUDY</button>
         <button onClick={() => onChangeView(ViewState.READING)} className={currentView === ViewState.READING ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 font-bold text-xs'}>READ</button>
         <button onClick={() => onChangeView(ViewState.SETTINGS)} className={currentView === ViewState.SETTINGS ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 font-bold text-xs'}>DATA</button>
      </div>
    </div>
  );
};

export default Layout;