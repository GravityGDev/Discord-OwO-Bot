/* eslint-disable no-console */

// This intentionally does not create a bot instance or connect to Discord/Mongo.
// It verifies that the deployment Node version can load the main application and
// complete command tree without syntax/module-resolution crashes.
require('../src/owo.js');
require('../src/commands/command.js');

console.log('OwO runtime module tree loaded successfully.');

// Some legacy dependencies keep event-loop handles open simply by being imported.
// This smoke test only validates that the complete runtime module tree resolves and
// evaluates successfully; the real process lifecycle is exercised by deployment.
process.exit(0);
