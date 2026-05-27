const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // Fix primary blue buttons: bg-blue-600 with text-slate-900 -> text-white
      content = content.replace(/text-slate-900 dark:text-white([^>]*bg-blue-600)/g, 'text-white$1');
      content = content.replace(/(bg-blue-600[^>]*)text-slate-900 dark:text-white/g, '$1text-white');
      
      // Fix bg-white/10 buttons in light mode
      content = content.replace(/bg-white\/10 hover:bg-white\/20 border border-slate-300 dark:border-white\/20 text-slate-900 dark:text-white/g, 'bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-white shadow-sm dark:shadow-none');
      
      content = content.replace(/bg-white\/10 border border-slate-300 dark:border-white\/20 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded hover:bg-white\/20/g, 'bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded shadow-sm dark:shadow-none');

      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('src');
console.log('Done fixing buttons');
