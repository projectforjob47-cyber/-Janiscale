import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('dist')) results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // replace hex colors: #[0-9a-fA-F]{3,8} followed by quote, semicolon, comma, paren, space, bracket
    const clean = line.replace(/#[0-9a-fA-F]{3,8}\b/g, '');
    if (clean.includes('#')) {
      console.log(`${path.basename(f)}:${idx + 1}: ${line.trim()}`);
    }
  });
});
