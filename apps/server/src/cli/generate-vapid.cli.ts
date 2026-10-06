import { createECDH } from 'node:crypto';

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();

const publicKeyBase64 = ecdh.getPublicKey('base64', 'uncompressed');
const privateKeyBase64 = ecdh.getPrivateKey('base64');

const publicKey = toBase64Url(publicKeyBase64);
const privateKey = toBase64Url(privateKeyBase64);

console.log('VAPID keys generated successfully.');
console.log('Add these values to your .env file:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
