const fs = require('fs');
const path = require('path');

const dir = 'D:/HON-2';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const indexContent = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

// Extract the social-icons div from index.html
const startTag = '<div class="social-icons">';
const endTag = '</div>';

const startIndex = indexContent.indexOf(startTag);
// find the closing div of social-icons
// it has some inner SVGs, but we can just use a regex or string split.
// Wait, regex is easier for matching the exact block in index.html
const match = indexContent.match(/<div class="social-icons">[\s\S]*?<\/div>/);

if (!match) {
    console.error("Could not find social-icons in index.html");
    process.exit(1);
}

const correctSocialBlock = match[0];
console.log("Found correct block, length: " + correctSocialBlock.length);

let updated = 0;

for (const file of files) {
    if (file === 'index.html') continue;
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find the social-icons block in the current file
    const fileMatch = content.match(/<div class="social-icons">[\s\S]*?<\/div>/);
    if (fileMatch) {
        content = content.replace(fileMatch[0], correctSocialBlock);
        fs.writeFileSync(filePath, content, 'utf8');
        updated++;
        console.log(`Updated ${file}`);
    } else {
        console.log(`No social-icons block in ${file}`);
    }
}

console.log(`Done updating ${updated} files.`);
