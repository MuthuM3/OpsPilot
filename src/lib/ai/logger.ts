import fs from 'fs';
import path from 'path';

export function logToFile(message: string) {
  try {
    const logPath = path.join(process.cwd(), 'scratch', 'app.log');
    if (!fs.existsSync(path.dirname(logPath))) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    }
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    // ignore
  }
}
