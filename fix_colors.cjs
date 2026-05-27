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
      
      content = content.replace(/(?<!dark:)text-emerald-400/g, 'text-emerald-600 dark:text-emerald-400');
      content = content.replace(/(?<!dark:)text-emerald-500/g, 'text-emerald-600 dark:text-emerald-500');
      
      content = content.replace(/(?<!dark:)text-amber-400/g, 'text-amber-600 dark:text-amber-400');
      content = content.replace(/(?<!dark:)text-amber-500/g, 'text-amber-600 dark:text-amber-500');

      content = content.replace(/(?<!dark:)text-rose-400/g, 'text-rose-600 dark:text-rose-400');
      content = content.replace(/(?<!dark:)text-rose-500/g, 'text-rose-600 dark:text-rose-500');
      
      content = content.replace(/(?<!dark:)text-blue-400/g, 'text-blue-600 dark:text-blue-400');
      
      // Also for borders:
      content = content.replace(/(?<!dark:)border-emerald-500\/30/g, 'border-emerald-600/30 dark:border-emerald-500/30');
      content = content.replace(/(?<!dark:)border-emerald-500\/40/g, 'border-emerald-600/40 dark:border-emerald-500/40');
      content = content.replace(/(?<!dark:)border-amber-500\/20/g, 'border-amber-600/20 dark:border-amber-500/20');
      content = content.replace(/(?<!dark:)border-amber-500\/40/g, 'border-amber-600/40 dark:border-amber-500/40');
      content = content.replace(/(?<!dark:)border-rose-500\/20/g, 'border-rose-600/20 dark:border-rose-500/20');
      content = content.replace(/(?<!dark:)border-blue-500\/20/g, 'border-blue-600/20 dark:border-blue-500/20');
      content = content.replace(/(?<!dark:)border-blue-500\/40/g, 'border-blue-600/40 dark:border-blue-500/40');
      
      // And backgrounds with opacity needed adjusting for better contrast
      // Not strictly necessary, but let's just make the text readable first
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('src');
console.log('Done fixing colored tags');
