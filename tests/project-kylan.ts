import {
  Provider,
  Program,
  setProvider,
  workspace,
  web3,
  BN,
  Spl,
  utils,
  SplToken,
} from '@project-serum/anchor'
import { ProjectKylan } from '../target/types/project_kylan'
import {
  initializeMint,
  initializeAccount,
  findCert,
  findCheque,
} from './pretest'

const PRICE = new BN(100_000)
const FEE = new BN(5_000)

// https://github.com/project-serum/anchor/issues/1126
const CertState = {
  Uninitialized: { uninitialized: {} },
  Active: { active: {} },
  PrintOnly: { printOnly: {} },
  BurnOnly: { burnOnly: {} },
  Paused: { paused: {} },
}

describe('project-kylan', () => {
  // Configure the client to use the local cluster.
  const provider = Provider.env()
  setProvider(provider)
  // Build needed accounts
  let splProgram: Program<SplToken> = Spl.token(),
    kylanProgram: Program<ProjectKylan> = workspace.ProjectKylan,
    stableToken: web3.Keypair = web3.Keypair.generate(),
    secureToken: web3.Keypair = web3.Keypair.generate(),
    printer: web3.Keypair = web3.Keypair.generate(),
    cert: web3.PublicKey,
    cheque: web3.PublicKey,
    treasurer: web3.PublicKey,
    treasury: web3.PublicKey,
    stableAssociatedTokenAccount: web3.PublicKey,
    secureAssociatedTokenAccount: web3.PublicKey,
    taxmanAuthority: web3.Keypair = web3.Keypair.generate(),
    taxman: web3.PublicKey
  before(async () => {
    cert = await findCert(
      printer.publicKey,
      secureToken.publicKey,
      kylanProgram.programId,
    )
    cheque = await findCheque(
      printer.publicKey,
      secureToken.publicKey,
      kylanProgram.provider.wallet.publicKey,
      kylanProgram.programId,
    )
    const [treasurerPublicKey] = await web3.PublicKey.findProgramAddress(
      [stableToken.publicKey.toBuffer()],
      kylanProgram.programId,
    )
    treasurer = treasurerPublicKey
    treasury = await utils.token.associatedAddress({
      owner: treasurer,
      mint: secureToken.publicKey,
    })
    stableAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: provider.wallet.publicKey,
      mint: stableToken.publicKey,
    })
    secureAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: provider.wallet.publicKey,
      mint: secureToken.publicKey,
    })
    taxman = await utils.token.associatedAddress({
      owner: taxmanAuthority.publicKey,
      mint: secureToken.publicKey,
    })
  })

  it('initialize a secure token', async () => {
    await initializeMint(9, secureToken, provider)
    await initializeAccount(
      secureAssociatedTokenAccount,
      secureToken.publicKey,
      provider,
    )
    await splProgram.rpc.mintTo(new BN(1000_000_000_000), {
      accounts: {
        mint: secureToken.publicKey,
        to: secureAssociatedTokenAccount,
        authority: provider.wallet.publicKey,
      },
      signers: [],
    })
    const { amount } = await (splProgram.account as any).token.fetch(
      secureAssociatedTokenAccount,
    )
    console.log('\tSecure Token:', secureToken.publicKey.toBase58())
    console.log('\tAmount:', amount.toNumber())
  })

  it('initialize a printer', async () => {
    await kylanProgram.rpc.initializePrinter(9, {
      accounts: {
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        treasurer,
        printer: printer.publicKey,
      },
      signers: [stableToken, printer],
    })
    const { mintAuthority } = await (splProgram.account as any).mint.fetch(
      stableToken.publicKey,
    )
    console.log('\tStable Token:', stableToken.publicKey.toBase58())
    console.log('\tMint Authority:', mintAuthority.toBase58())
  })

  it('initialize a cert', async () => {
    await kylanProgram.rpc.initializeCert(PRICE, FEE, {
      accounts: {
        stableToken: stableToken.publicKey,
        secureToken: secureToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cert,
        taxman,
        taxmanAuthority: taxmanAuthority.publicKey,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    const { printer: printerPublicKey } = await kylanProgram.account.cert.fetch(
      cert,
    )
    console.log('\tPrinter:', printerPublicKey.toBase58())
  })

  it('initialize a cheque', async () => {
    await kylanProgram.rpc.initializeCheque({
      accounts: {
        stableToken: stableToken.publicKey,
        secureToken: secureToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cheque,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    const { printer: printerPublicKey } =
      await kylanProgram.account.cheque.fetch(cheque)
    console.log('\tPrinter:', printerPublicKey.toBase58())
  })

  it('print #1', async () => {
    await kylanProgram.rpc.print(new BN(10_000_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: secureAssociatedTokenAccount,
        dstAssociatedTokenAccount: stableAssociatedTokenAccount,
        printer: printer.publicKey,
        cert,
        cheque,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury)
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount)
    const { amount: chequeAmount } = await kylanProgram.account.cheque.fetch(
      cheque,
    )
    console.log('\tSecure Amount:', secureAmount.toNumber())
    console.log('\tStable Amount:', stableAmount.toNumber())
    console.log('\tCheque Amount:', chequeAmount.toNumber())
  })

  it('print #2', async () => {
    await kylanProgram.rpc.print(new BN(10_000_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: secureAssociatedTokenAccount,
        dstAssociatedTokenAccount: stableAssociatedTokenAccount,
        printer: printer.publicKey,
        cert,
        cheque,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury)
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount)
    const { amount: chequeAmount } = await kylanProgram.account.cheque.fetch(
      cheque,
    )
    console.log('\tSecure Amount:', secureAmount.toNumber())
    console.log('\tStable Amount:', stableAmount.toNumber())
    console.log('\tCheque Amount:', chequeAmount.toNumber())
  })

  it('get data manually', async () => {
    const { data: buf } = await (
      splProgram.account as any
    ).token.getAccountInfo(stableAssociatedTokenAccount)
    const { amount } = splProgram.coder.accounts.decode('Token', buf)
    console.log('\tStable Amount:', amount.toNumber())
  })

  it('burn #1', async () => {
    await kylanProgram.rpc.burn(new BN(500_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: stableAssociatedTokenAccount,
        dstAssociatedTokenAccount: secureAssociatedTokenAccount,
        printer: printer.publicKey,
        cert,
        cheque,
        taxman,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury)
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount)
    console.log('\tSecure Amount:', secureAmount.toNumber())
    console.log('\tStable Amount:', stableAmount.toNumber())
  })

  it('burn #2', async () => {
    await kylanProgram.rpc.burn(new BN(500_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: stableAssociatedTokenAccount,
        dstAssociatedTokenAccount: secureAssociatedTokenAccount,
        printer: printer.publicKey,
        cert,
        cheque,
        taxman,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury)
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount)
    console.log('\tSecure Amount:', secureAmount.toNumber())
    console.log('\tStable Amount:', stableAmount.toNumber())
  })

  it('set cert state to paused', async () => {
    const { state: prevState } = await kylanProgram.account.cert.fetch(cert)
    console.log('\tPrev State:', prevState)
    const state = CertState.PrintOnly
    await kylanProgram.rpc.setCertState(state, {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cert,
      },
    })
    const { state: nextState } = await kylanProgram.account.cert.fetch(cert)
    console.log('\tNext State:', nextState)
  })

  it('failed to burn when print-only', async () => {
    try {
      await kylanProgram.rpc.burn(new BN(500_000_000), {
        accounts: {
          secureToken: secureToken.publicKey,
          stableToken: stableToken.publicKey,
          authority: provider.wallet.publicKey,
          treasurer,
          treasury,
          srcAssociatedTokenAccount: stableAssociatedTokenAccount,
          dstAssociatedTokenAccount: secureAssociatedTokenAccount,
          printer: printer.publicKey,
          cert,
          cheque,
          taxman,
          tokenProgram: utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        },
      })
    } catch ({ msg }) {
      if (msg !== "The token isn't available to burn")
        throw new Error('The function checks are by-passed')
    }
  })

  it('set cert fee', async () => {
    const newFee = new BN(1_000)
    await kylanProgram.rpc.setCertFee(newFee, {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cert,
      },
    })
    const { fee } = await kylanProgram.account.cert.fetch(cert)
    if (!fee.eq(newFee)) throw new Error('Cannot update cert fee')
  })

  it('set cert taxman', async () => {
    const taxmanAuthority = web3.Keypair.generate().publicKey
    const newTaxman = await utils.token.associatedAddress({
      mint: secureToken.publicKey,
      owner: taxmanAuthority,
    })
    await kylanProgram.rpc.setCertTaxman({
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cert,
        taxman: newTaxman,
        taxmanAuthority,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    const { taxman } = await kylanProgram.account.cert.fetch(cert)
    if (taxman.toBase58() !== newTaxman.toBase58())
      throw new Error('Cannot update cert taxman')
  })
})
