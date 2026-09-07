const fs = require('fs');
const target = process.argv[2];
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  fs.writeFileSync(target, data, 'utf8');
  console.log('Wrote to ' + target);
});
