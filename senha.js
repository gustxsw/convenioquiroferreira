import bcrypt from 'bcrypt';

async function gerarHash() {
  const senha = 'a123456b';
  const hash = await bcrypt.hash(senha, 12);
  console.log(hash);
}

gerarHash();