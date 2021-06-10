const readline = require('readline');
const prompt = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

prompt.question(
  '\n\x1b[91m\x1b[1mYou are interacting with PROD, are you sure you want to continue?\x1b[0m\n\x1b[2m[y/n]\x1b[0m ',
  yesNo => {
    console.log();
    process.exit(['yes', 'y', 'true', '1'].includes(yesNo.toLowerCase()) ? 0 : 1);
  },
);
