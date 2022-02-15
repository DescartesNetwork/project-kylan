import { Provider, web3, Spl, utils } from '@project-serum/anchor'

const splProgram = Spl.token()

export const initializeMint = async (
  decimals: number,
  token: web3.Keypair,
  provider: Provider,
) => {
  const ix = await (splProgram.account as any).mint.createInstruction(token)
  const tx = new web3.Transaction().add(ix)
  await provider.send(tx, [token])
  return await splProgram.rpc.initializeMint(
    decimals,
    provider.wallet.publicKey,
    provider.wallet.publicKey,
    {
      accounts: {
        mint: token.publicKey,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [],
    },
  )
}

export const initializeAccount = async (
  associatedTokenAccount: web3.PublicKey,
  token: web3.PublicKey,
  provider: Provider,
) => {
  const ix = new web3.TransactionInstruction({
    keys: [
      {
        pubkey: provider.wallet.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: associatedTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: provider.wallet.publicKey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: token,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: utils.token.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: utils.token.ASSOCIATED_PROGRAM_ID,
    data: Buffer.from([]),
  })
  const tx = new web3.Transaction().add(ix)
  return await provider.send(tx)
}

export const findCert = async (
  printer: web3.PublicKey,
  secureToken: web3.PublicKey,
  programId: web3.PublicKey,
) => {
  const [cert] = await web3.PublicKey.findProgramAddress(
    [Buffer.from('cert'), printer.toBuffer(), secureToken.toBuffer()],
    programId,
  )
  return cert
}
