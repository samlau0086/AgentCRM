const fs = require('fs');
const path = require('path');

const replacements = [
  ['text-white', 'text-slate-900 dark:text-white'],
  ['text-slate-200', 'text-slate-800 dark:text-slate-200'],
  ['text-slate-300', 'text-slate-700 dark:text-slate-300'],
  ['text-slate-400', 'text-slate-500 dark:text-slate-400'],
  ['text-slate-500', 'text-slate-400 dark:text-slate-500'],
  
  ['border-white/5', 'border-slate-200 dark:border-white/5'],
  ['border-white/10', 'border-slate-200 dark:border-white/10'],
  ['border-white/20', 'border-slate-300 dark:border-white/20'],

  ['hover:bg-white/5', 'hover:bg-slate-100 dark:hover:bg-white/5'],
  ['hover:bg-white/10', 'hover:bg-slate-200 dark:hover:bg-white/10'],
  ['hover:bg-white/\\[0.08\\]', 'hover:bg-slate-100 dark:hover:bg-white/[0.08]'],
  ['hover:text-white', 'hover:text-slate-900 dark:hover:text-white'],

  ['bg-white/5', 'bg-white dark:bg-white/5 shadow-sm dark:shadow-none'],
  ['bg-white/\\[0.02\\]', 'bg-white dark:bg-white/[0.02] shadow-sm dark:shadow-none'],
  ['bg-white/\\[0.04\\]', 'bg-slate-50 dark:bg-white/[0.04]'],
  ['bg-black/20', 'bg-slate-50 dark:bg-black/20'],
  ['bg-black/40', 'bg-white dark:bg-black/40'],
  ['bg-\\[#050608\\]', 'bg-slate-50 dark:bg-[#050608]'],
  ['backdrop-blur-xl', 'backdrop-blur-xl bg-white/80 dark:bg-black/40 border-b border-slate-200 dark:border-white/5'] // for knowledgeBase sync card
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      replacements.forEach(([key, val]) => {
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<!dark:)(?<![\\w\\-])${safeKey}(?![\\w\\-])`, 'g');
        content = content.replace(regex, val);
      });

      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('src/pages');
console.log('Class mapping complete');
