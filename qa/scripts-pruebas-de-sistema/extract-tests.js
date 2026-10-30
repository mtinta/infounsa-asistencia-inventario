const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', '..', 'docs', '07_aseguramiento_calidad', 'casos_de_pruebas', 'pruebas_de_sistema');
const destDir = path.join(__dirname, 'tests');

// Ensure destination directories exist
const modules = {
  ast: path.join(destDir, 'asistencia'),
  inv: path.join(destDir, 'inventario'),
  web: path.join(destDir, 'portal-web')
};

Object.values(modules).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper to clean lines
function cleanLine(line) {
  // Remove copy-paste markers
  let cleaned = line.replace(/[\uec03\uec02]/g, '');
  
  // Clean markdown links inside code: [text](link) -> text
  cleaned = cleaned.replace(/\[([^\]\n]+)\]\([^\)\n]+\)/g, '$1');
  
  // Clean backticks formatting like `  `
  cleaned = cleaned.replace(/^\s*`\s*`\s*/, '  ');

  // Fix escaped characters
  cleaned = cleaned.replace(/\\_/g, '_');
  cleaned = cleaned.replace(/\\\*/g, '*');
  cleaned = cleaned.replace(/\\%/g, '%');
  cleaned = cleaned.replace(/\\#/g, '#');
  cleaned = cleaned.replace(/\\-/g, '-');
  cleaned = cleaned.replace(/\\`/g, '`');
  cleaned = cleaned.replace(/\\\[/g, '[').replace(/\\\]/g, ']');

  // Fix smart quotes
  cleaned = cleaned.replace(/[\u201c\u201d]/g, '"');
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'");

  // Fix page.goto custom cleaning
  if (cleaned.includes('page.goto')) {
    const urlMatch = cleaned.match(/(https?:\/\/[^\s'"\(\)\[\]\<\>;]+)/);
    if (urlMatch) {
      let url = urlMatch[1];
      // Strip trailing characters that shouldn't be in a URL
      url = url.replace(/['"\]\)\;\<\>]+$/, '');
      
      const commentMatch = cleaned.match(/\/\/.*$/);
      const comment = commentMatch ? ' ' + commentMatch[0] : '';
      
      cleaned = `  await page.goto('${url}');${comment}`;
    }
  }

  return cleaned;
}

// Read all MD files
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md'));

files.forEach(file => {
  const filePath = path.join(srcDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let currentBlock = [];
  let inBlock = false;
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check block start
    if (line.includes('\uec03') || line.includes('') || line.trim().startsWith('```js') || line.trim().startsWith('```ts') || line.trim().startsWith('```javascript')) {
      inBlock = true;
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      continue;
    }
    
    // Check block end
    if (line.includes('\uec02') || line.includes('') || (inBlock && line.trim().startsWith('```'))) {
      inBlock = false;
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      continue;
    }

    if (inBlock) {
      // If we see next markdown header, close block
      if (line.trim().startsWith('##')) {
        inBlock = false;
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
      } else {
        currentBlock.push(line);
      }
    } else {
      // Fallback for code blocks that might not have explicit delimiters
      if (line.trim().startsWith('import { test') || line.trim().startsWith('test(')) {
        inBlock = true;
        currentBlock.push(line);
      }
    }
  }

  // Handle EOF if block didn't close
  if (inBlock && currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  if (blocks.length === 0) return;

  const cleanedBlocks = [];

  blocks.forEach(block => {
    const blockLines = block.split(/\r?\n/);
    const cleanedBlockLines = [];
    
    blockLines.forEach(bl => {
      const cleaned = cleanLine(bl);
      cleanedBlockLines.push(cleaned);
    });

    cleanedBlocks.push(cleanedBlockLines.join('\n'));
  });

  let fileContent = cleanedBlocks.join('\n\n');

  // Fix multiline test names globally
  fileContent = fileContent.replace(/test\(\s*['"]([^'"]*)['"]\s*,\s*async/gs, (match, p1) => {
    const cleanName = p1.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    return `test('${cleanName}', async`;
  });

  // Final escapes cleanup
  fileContent = fileContent.replace(/\\_/g, '_');
  fileContent = fileContent.replace(/\\\*/g, '*');
  fileContent = fileContent.replace(/\\%/g, '%');
  fileContent = fileContent.replace(/\\#/g, '#');
  fileContent = fileContent.replace(/\\-/g, '-');
  fileContent = fileContent.replace(/\\`/g, '`');

  // Deduplicate and move imports to the top
  const finalLines = fileContent.split(/\r?\n/);
  const imports = new Set();
  const restLines = [];
  
  finalLines.forEach(line => {
    if (line.trim().startsWith('import ')) {
      imports.add(line.trim());
    } else {
      restLines.push(line);
    }
  });

  // If playwright import is missing, add it
  let hasPlaywrightImport = false;
  imports.forEach(imp => {
    if (imp.includes('@playwright/test')) hasPlaywrightImport = true;
  });
  if (!hasPlaywrightImport) {
    imports.add("import { test, expect } from '@playwright/test';");
  }

  const sortedImports = Array.from(imports).sort((a, b) => {
    if (a.includes('@playwright/test')) return -1;
    if (b.includes('@playwright/test')) return 1;
    return a.localeCompare(b);
  });

  const finalContent = sortedImports.join('\n') + '\n\n' + restLines.join('\n');

  const baseName = file.replace('.md', '.spec.ts');
  let targetFolder = modules.web;
  if (file.includes('ast')) {
    targetFolder = modules.ast;
  } else if (file.includes('inv')) {
    targetFolder = modules.inv;
  }

  const specPath = path.join(targetFolder, baseName);
  fs.writeFileSync(specPath, finalContent, 'utf8');
  console.log(`Extracted ${blocks.length} tests to ${specPath}`);
});

console.log('Extraction complete!');
