import {
  BN,
  Program,
  SplToken,
  utils,
  Wallet,
  web3,
} from '@project-serum/anchor'
import { program } from '@project-serum/anchor/dist/cjs/spl/token'
import Kylan, { DEFAULT_KYLAN_PROGRAM_ID } from '../dist/lib'
import { initializeAccount, initializeMint } from './pretest'

const PRIV_KEY_FOR_TEST_ONLY = Buffer.from([
  2, 178, 226, 192, 204, 173, 232, 36, 247, 215, 203, 12, 177, 251, 254, 243,
  92, 38, 237, 60, 38, 248, 213, 19, 73, 180, 31, 164, 63, 210, 172, 90, 85,
  215, 166, 105, 84, 194, 133, 92, 34, 27, 39, 2, 158, 57, 64, 226, 198, 222,
  25, 127, 150, 87, 141, 234, 34, 239, 139, 107, 155, 32, 47, 199,
])

describe('@project-kylan/core', function () {
  const wallet = new Wallet(web3.Keypair.fromSecretKey(PRIV_KEY_FOR_TEST_ONLY))
  let kylan: Kylan,
    connection: web3.Connection,
    splProgram: Program<SplToken>,
    printerAddress: string,
    stableTokenAddress: string,
    secureTokenAddress: string,
    stableAssociatedTokenAddress: string,
    secureAssociatedTokenAddress: string

  before(async () => {
    const {
      program: { provider },
    } = new Kylan(wallet)
    splProgram = program(provider)
    const secureToken = web3.Keypair.generate()
    secureTokenAddress = secureToken.publicKey.toBase58()
    secureAssociatedTokenAddress = (
      await utils.token.associatedAddress({
        owner: provider.wallet.publicKey,
        mint: secureToken.publicKey,
      })
    ).toBase58()
    await initializeMint(6, secureToken, splProgram)
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
    const { amount } = await (splProgram.account as any).token.fetch(
      new web3.PublicKey(secureAssociatedTokenAddress),
    )
    console.log('\tSecure Token:', secureToken.publicKey.toBase58())
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
    const { printerAddress: pa } = await kylan.initializePrinter(
      secureTokenAddress,
    )
    printerAddress = pa
    console.log(printerAddress)
  })
})
