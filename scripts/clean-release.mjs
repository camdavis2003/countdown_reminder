import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('release');

function isRetryable(err) {
  return err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES');
}

async function rmWithRetries(dirPath, attempts, delayMs) {
  for (let i = 1; i <= attempts; i++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (e) {
      if (!isRetryable(e) || i === attempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

try {
  await rmWithRetries(target, 12, 500);
  console.log(`Deleted: ${target}`);
} catch (e) {
  console.error(`Failed to delete: ${target}`);
  console.error(e);
  console.error(
    '\nIf this is EBUSY/EPERM/EACCES on Windows, something is holding a file open (often an antivirus scan or a running packaged app).\n' +
      '- Close any running "Countdown Reminder" instances (including tray).\n' +
      '- Close File Explorer windows opened inside the release folder.\n' +
      '- Consider adding an AV/Defender exclusion for this project folder.\n' +
      '- Then re-run: npm run pack:win\n'
  );
  process.exitCode = 1;
}
