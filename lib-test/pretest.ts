import { Program, SplToken, utils, web3 } from '@project-serum/anchor'

export const initializeMint = async (
  decimals: number,
  token: web3.Keypair,
  splProgram: Program<SplToken>,
) => {
  const ix = await (splProgram.account as any).mint.createInstruction(token)
  const tx = new web3.Transaction().add(ix)
  await splProgram.provider.send(tx, [token])
  return await splProgram.rpc.initializeMint(
    decimals,
    splProgram.provider.wallet.publicKey,
    splProgram.provider.wallet.publicKey,
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
  associatedTokenAddress: string,
  tokenAddress: string,
  splProgram: Program<SplToken>,
) => {
  const ix = new web3.TransactionInstruction({
    keys: [
      {
        pubkey: splProgram.provider.wallet.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: new web3.PublicKey(associatedTokenAddress),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: splProgram.provider.wallet.publicKey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new web3.PublicKey(tokenAddress),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: splProgram.programId,
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
  return await splProgram.provider.send(tx)
}
