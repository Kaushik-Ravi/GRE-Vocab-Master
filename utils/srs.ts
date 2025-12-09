import { WordData } from '../types';

// Standard Leitner Intervals in Days
// Box 1: 1 day
// Box 2: 3 days
// Box 3: 7 days
// Box 4: 14 days
// Box 5: 30 days
const INTERVALS = [1, 1, 3, 7, 14, 30];

export const calculateNextReview = (currentBox: number, isCorrect: boolean): { box: number; nextReview: number } => {
  let newBox = currentBox;
  
  if (isCorrect) {
    // Promote to next box, cap at 5
    newBox = Math.min(currentBox + 1, 5);
  } else {
    // Incorrect: Reset to Box 1 (Frequent Review)
    newBox = 1;
  }

  const daysToAdd = INTERVALS[newBox] || 1;
  const nextReview = Date.now() + (daysToAdd * 24 * 60 * 60 * 1000);

  return {
    box: newBox,
    nextReview
  };
};

export const isDueForReview = (word: WordData): boolean => {
  if (word.mastered) return false;
  // If box is 0 (new) or undefined, it's not strictly "due" by SRS logic, 
  // but handled by the "New Sets" view.
  // This function checks if a word actively in the learning pile is due.
  if (!word.nextReviewDate && word.leitnerBox > 0) return true; // Safety fallback
  
  return word.leitnerBox > 0 && Date.now() >= word.nextReviewDate;
};

export const getReviewQueue = (words: WordData[]): WordData[] => {
  return words.filter(w => isDueForReview(w));
};