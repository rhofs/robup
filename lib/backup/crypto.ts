import crypto from 'crypto';
import fs from 'fs';
import { pipeline } from 'stream/promises';

// Encryption for backups that leave this machine.
//
// A snapshot of the database is not just tasks and docs: it holds password hashes, Google refresh
// tokens, calendar feed tokens and push tokens — bearer credentials for every user. Putting that in
// someone's Google Drive in the clear would make the Drive account a copy of every one of those
// secrets. So the off-site archive is encrypted with a passphrase that lives only on the server and
// in the owner's password manager, never next to the backups.
//
// Format (".siqtbak"):  MAGIC(8) | salt(16) | iv(12) | ciphertext … | GCM auth tag(16)
// AES-256-GCM, key from scrypt(passphrase, salt). Streamed both ways, so the uploads folder can grow
// without the archive ever having to fit in memory. The tag at the end is what makes a wrong
// passphrase or a corrupted download fail loudly instead of producing garbage.
const MAGIC = Buffer.from('SIQTBAK1');
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32, SCRYPT);
}

export async function encryptFile(inPath: string, outPath: string, passphrase: string): Promise<void> {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const out = fs.createWriteStream(outPath);
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(fs.createReadStream(inPath), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => out.end(cipher.getAuthTag(), () => resolve()).on('error', reject));
}

export async function decryptFile(inPath: string, outPath: string, passphrase: string): Promise<void> {
  const size = fs.statSync(inPath).size;
  const headerLen = MAGIC.length + 16 + 12;
  if (size < headerLen + 16) throw new Error('Not a Siqt backup (file too small).');
  const fd = fs.openSync(inPath, 'r');
  const header = Buffer.alloc(headerLen);
  const tag = Buffer.alloc(16);
  fs.readSync(fd, header, 0, headerLen, 0);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Siqt backup (wrong header).');
  const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = header.subarray(MAGIC.length + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(inPath, { start: headerLen, end: size - 17 }), decipher, fs.createWriteStream(outPath));
  } catch (err) {
    fs.rmSync(outPath, { force: true });
    throw new Error(`Could not decrypt — wrong passphrase, or the file is damaged. (${(err as Error).message})`);
  }
}
