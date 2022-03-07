import {
  BN,
  Program,
  SplToken,
  utils,
  Wallet,
  web3,
} from '@project-serum/anchor'
import { program } from '@project-serum/anchor/dist/cjs/spl/token'
import Kylan, { CertStates, DEFAULT_KYLAN_PROGRAM_ID } from '../dist/lib'
import { initializeAccount, initializeMint } from './pretest'

const PRIV_KEY_FOR_TEST_ONLY = Buffer.from([
  2, 178, 226, 192, 204, 173, 232, 36, 247, 215, 203, 12, 177, 251, 254, 243,
  92, 38, 237, 60, 38, 248, 213, 19, 73, 180, 31, 164, 63, 210, 172, 90, 85,
  215, 166, 105, 84, 194, 133, 92, 34, 27, 39, 2, 158, 57, 64, 226, 198, 222,
  25, 127, 150, 87, 141, 234, 34, 239, 139, 107, 155, 32, 47, 199,
])
const PRECISION = new BN(1_000_000)
const RATE = new BN(1_000_000)
const FEE = new BN(2_500)

describe('@project-kylan/core', function () {
  const wallet = new Wallet(web3.Keypair.fromSecretKey(PRIV_KEY_FOR_TEST_ONLY))
  let kylan: Kylan,
    connection: web3.Connection,
    splProgram: Program<SplToken>,
    printerAddress: string,
    certAddress: string,
    chequeAddress: string,
    stableTokenAddress: string,
    secureTokenAddress: string,
    stableAssociatedTokenAddress: string,
    secureAssociatedTokenAddress: string,
    taxmanAuthorityAddress: string =
      web3.Keypair.generate().publicKey.toBase58()
  before(async () => {
    const {
      program: { provider },
    } = new Kylan(wallet)
    splProgram = program(provider)
    // Init a secure token
    const secureToken = web3.Keypair.generate()
    secureTokenAddress = secureToken.publicKey.toBase58()
    await initializeMint(6, secureToken, splProgram)
    secureAssociatedTokenAddress = (
      await utils.token.associatedAddress({
        owner: provider.wallet.publicKey,
        mint: new web3.PublicKey(secureTokenAddress),
      })
    ).toBase58()
    // Mint secure tokens
    await initializeAccount(
      secureAssociatedTokenAddress,
      secureTokenAddress,
      splProgram,
    )
    await splProgram.rpc.mintTo(new BN(1_000_000_000), {
      accounts: {
        mint: new web3.PublicKey(secureTokenAddress),
        to: new web3.PublicKey(secureAssociatedTokenAddress),
        authority: provider.wallet.publicKey,
      },
      signers: [],
    })
    // Check data
    const { amount } = await (splProgram.account as any).token.fetch(
      new web3.PublicKey(secureAssociatedTokenAddress),
    )
    console.log('\tSecure Token:', secureTokenAddress)
    console.log('\tAmount:', amount.toNumber())
  })

  it('constructor', async function () {
    kylan = new Kylan(wallet)
    if (kylan.program.programId.toBase58() !== DEFAULT_KYLAN_PROGRAM_ID)
      throw new Error('Cannot contruct a kylan instance')
    // Setup test supporters
    connection = kylan.program.provider.connection
    // Airdrop to wallet
    const lamports = await connection.getBalance(wallet.publicKey)
    if (lamports < 10 * web3.LAMPORTS_PER_SOL)
      await connection.requestAirdrop(wallet.publicKey, web3.LAMPORTS_PER_SOL)
  })

  it('initialize a printer', async function () {
    const { printerAddress: pa, stableTokenAddress: sta } =
      await kylan.initializePrinter()
    printerAddress = pa
    stableTokenAddress = sta
    stableAssociatedTokenAddress = (
      await utils.token.associatedAddress({
        owner: kylan.program.provider.wallet.publicKey,
        mint: new web3.PublicKey(stableTokenAddress),
      })
    ).toBase58()
    certAddress = await kylan.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
    )
    chequeAddress = await kylan.deriveChequeAddress(
      printerAddress,
      secureTokenAddress,
    )
  })

  it('get printer data', async function () {
    await kylan.getPrinterData(printerAddress)
  })

  it('initialize a cert', async function () {
    await kylan.initializeCert(
      printerAddress,
      secureTokenAddress,
      taxmanAuthorityAddress,
      RATE,
      FEE,
    )
  })

  it('get cert data', async function () {
    await kylan.getCertData(certAddress)
  })

  it('initialize a cheque', async function () {
    await kylan.initializeCheque(printerAddress, secureTokenAddress)
  })

  it('get cheque data', async function () {
    await kylan.getChequeData(chequeAddress)
  })

  it('print #1 - the associated account is not initialized', async function () {
    const amount = new BN(10 ** 6)
    const { dstAddress } = await kylan.print(
      amount,
      secureTokenAddress,
      printerAddress,
    )
    // Test stable balance
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(dstAddress)
    if (!amount.eq(stableAmount)) throw new Error('Invalid printed amount')
    // Test cheque history
    const { amount: chequeAmount } = await kylan.getChequeData(chequeAddress)
    if (!amount.eq(chequeAmount)) throw new Error('Invalid printed amount')
  })

  it('print #2 - the associated account is already initialized', async function () {
    const amount = new BN(10 ** 6)
    const { dstAddress } = await kylan.print(
      amount,
      secureTokenAddress,
      printerAddress,
    )
    // Test stable balance
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(dstAddress)
    if (!amount.mul(new BN(2)).eq(stableAmount))
      throw new Error('Invalid printed amount')
    // Test cheque history
    const { amount: chequeAmount } = await kylan.getChequeData(chequeAddress)
    if (!amount.mul(new BN(2)).eq(chequeAmount))
      throw new Error('Invalid printed amount')
  })

  it('burn', async function () {
    const amount = new BN(10 ** 6)
    await kylan.burn(amount, secureTokenAddress, printerAddress)
    // Test stable balance
    const srcAddress = await utils.token.associatedAddress({
      mint: new web3.PublicKey(stableTokenAddress),
      owner: kylan.program.provider.wallet.publicKey,
    })
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(srcAddress)
    if (!amount.eq(stableAmount)) throw new Error('Invalid burned amount')
    const { amount: chequeAmount } = await kylan.getChequeData(chequeAddress)
    // Test cheque history
    if (!amount.eq(chequeAmount)) throw new Error('Invalid printed amount')
    // Test taxman balance
    const taxmanAddress = await utils.token.associatedAddress({
      mint: new web3.PublicKey(secureTokenAddress),
      owner: new web3.PublicKey(taxmanAuthorityAddress),
    })
    const { amount: taxAmount } = await (splProgram.account as any).token.fetch(
      taxmanAddress,
    )
    if (!amount.mul(FEE).div(PRECISION).eq(taxAmount))
      throw new Error('Invalid charged amount')
  })

  it('set cert state', async function () {
    await kylan.setCertState(CertStates.Paused, certAddress)
    const { state } = await kylan.program.account.cert.fetch(certAddress)
    console.log(state)
  })

  it('set cert fee', async function () {
    const newFee = FEE.mul(new BN(2))
    await kylan.setCertFee(newFee, certAddress)
    const { fee } = await kylan.program.account.cert.fetch(certAddress)
    if (!fee.eq(newFee)) throw new Error('Cannot update cert fee')
  })

  it('set cert state', async function () {
    const newTaxmanAuthority = web3.Keypair.generate()
    const newTaxman = await utils.token.associatedAddress({
      mint: new web3.PublicKey(secureTokenAddress),
      owner: newTaxmanAuthority.publicKey,
    })
    await kylan.setCertTaxman(
      newTaxmanAuthority.publicKey.toBase58(),
      certAddress,
    )
    const { taxman } = await kylan.program.account.cert.fetch(certAddress)
    if (newTaxman.toBase58() !== taxman.toBase58())
      throw new Error('Cannot update cert taxman')
  })

  it('transfer authority', async () => {
    const newAuthorityAddress = web3.Keypair.generate().publicKey.toBase58()
    await kylan.transferAuthority(newAuthorityAddress, printerAddress)
    const { authority } = await kylan.getPrinterData(printerAddress)
    if (authority.toBase58() !== newAuthorityAddress)
      throw new Error('Cannot update new authority')
  })
})
