import { web3, Program, Provider, utils, BN } from '@project-serum/anchor'
import { TypeDef } from '@project-serum/anchor/dist/cjs/program/namespace/types'
import { Wallet } from '@project-serum/anchor/dist/cjs/provider'
import { ProjectKylan } from '../target/types/project_kylan'

import {
  DEFAULT_RPC_ENDPOINT,
  DEFAULT_KYLAN_PROGRAM_ID,
  DEFAULT_KYLAN_IDL,
} from './constant'
import { findCert, findCheque, isAddress } from './utils'

export type AnchorWallet = Wallet

export type KylanAccountChangeInfo = {
  type: 'printer' | 'cert' | 'cheque'
  address: string
  data: Buffer
}

export type PrinterData = TypeDef<ProjectKylan['accounts'][2], ProjectKylan>
export type CertData = TypeDef<ProjectKylan['accounts'][0], ProjectKylan>
export type ChequeData = TypeDef<ProjectKylan['accounts'][1], ProjectKylan>
type Uninitialized = { uninitialized: {} }
type Active = { active: {} }
type PrintOnly = { printOnly: {} }
type BurnOnly = { burnOnly: {} }
type Paused = { paused: {} }
export type CertState = Uninitialized | Active | PrintOnly | BurnOnly | Paused
export const CertStates: Record<string, CertState> = {
  Uninitialized: { uninitialized: {} },
  Active: { active: {} },
  PrintOnly: { printOnly: {} },
  BurnOnly: { burnOnly: {} },
  Paused: { paused: {} },
}

class Kylan {
  private _connection: web3.Connection
  private _provider: Provider
  readonly program: Program<ProjectKylan>

  constructor(
    wallet: AnchorWallet,
    rpcEndpoint: string = DEFAULT_RPC_ENDPOINT,
    programId: string = DEFAULT_KYLAN_PROGRAM_ID,
  ) {
    if (!isAddress(programId)) throw new Error('Invalid program id')
    // Private
    this._connection = new web3.Connection(rpcEndpoint, 'confirmed')
    this._provider = new Provider(this._connection, wallet, {
      skipPreflight: true,
      commitment: 'confirmed',
    })
    // Public
    this.program = new Program<ProjectKylan>(
      DEFAULT_KYLAN_IDL,
      programId,
      this._provider,
    )
  }

  /**
   * Watch account changes
   * @param callback
   * @param filters
   * @returns Watch id
   */
  watch = (
    callback: (
      error: string | null,
      data:
        | (Omit<KylanAccountChangeInfo, 'data'> & {
            data: PrinterData | CertData | ChequeData
          })
        | null,
    ) => void,
    filters?: web3.GetProgramAccountsFilter[],
  ): number => {
    const cb = ({
      accountId,
      accountInfo: { data: buf },
    }: web3.KeyedAccountInfo) => {
      const address = accountId.toBase58()
      let type = null
      let data = {}
      if (buf.length === this.program.account.printer.size) {
        type = 'printer'
        data = this.parsePrinterData(buf)
      }
      if (buf.length === this.program.account.cert.size) {
        type = 'cert'
        data = this.parseCertData(buf)
      }
      if (buf.length === this.program.account.cheque.size) {
        type = 'cheque'
        data = this.parseChequeData(buf)
      }
      if (!type) return callback('Unmatched type', null)
      return callback(null, {
        type: type as KylanAccountChangeInfo['type'],
        address,
        data: data as PrinterData | CertData | ChequeData,
      })
    }
    return this.program.provider.connection.onProgramAccountChange(
      this.program.programId,
      cb,
      'confirmed',
      filters,
    )
  }

  /**
   * Unwatch a watcher by watch id
   * @param watchId
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.program.provider.connection.removeProgramAccountChangeListener(
      watchId,
    )
  }

  /**
   * Parse printer buffer data.
   * @param data Printer buffer data.
   * @returns Printer readable data.
   */
  parsePrinterData = (data: Buffer): PrinterData => {
    return this.program.coder.accounts.decode('Printer', data)
  }

  /**
   * Get printer data.
   * @param printerAddress Printer address.
   * @returns Printer readable data.
   */
  getPrinterData = async (printerAddress: string): Promise<PrinterData> => {
    return this.program.account.printer.fetch(printerAddress)
  }

  /**
   * Parse certificate buffer data.
   * @param data Certificate buffer data.
   * @returns Certficate readable data.
   */
  parseCertData = (data: Buffer): CertData => {
    return this.program.coder.accounts.decode('Cert', data)
  }

  /**
   * Get cert data.
   * @param certAddress Certificate address.
   * @returns Certficate readable data.
   */
  getCertData = async (certAddress: string): Promise<CertData> => {
    return this.program.account.cert.fetch(certAddress)
  }

  /**
   * Parse cheque buffer data.
   * @param data Cheque buffer data.
   * @returns Cheque readable data.
   */
  parseChequeData = (data: Buffer): ChequeData => {
    return this.program.coder.accounts.decode('cheque', data)
  }

  /**
   * Get cheque data.
   * @param chequeAddress Cheque address.
   * @returns Cheque readable data.
   */
  getChequeData = async (chequeAddress: string): Promise<ChequeData> => {
    return this.program.account.cheque.fetch(chequeAddress)
  }

  /**
   * Derive a certificate address by printer address and secure token address.
   * @param printerAddress Printer address.
   * @param secureTokenAddress Secure token address.
   * @param strict (Optional) if true, a validation process will activate to make sure the cert is safe.
   * @returns Certificate address.
   */
  deriveCertAddress = async (
    printerAddress: string,
    secureTokenAddress: string,
    strict: boolean = false,
  ) => {
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    const certPublickKey = await findCert(
      new web3.PublicKey(printerAddress),
      new web3.PublicKey(secureTokenAddress),
      this.program.programId,
    )
    const certAddress = certPublickKey.toBase58()

    if (strict) {
      let onchainSecureTokenAddress: string
      try {
        const { secureToken } = await this.getCertData(certAddress)
        onchainSecureTokenAddress = secureToken.toBase58()
      } catch (er) {
        throw new Error(
          `This secure token ${secureTokenAddress} is not in the whitelist of printer ${printerAddress}`,
        )
      }
      if (secureTokenAddress !== onchainSecureTokenAddress)
        throw new Error('Violated certificate')
    }

    return certAddress
  }

  /**
   * Derive a cheque address by printer address and secure token address.
   * @param printerAddress Printer address.
   * @param secureTokenAddress Secure token address.
   * @param strict (Optional) if true, a validation process will activate to make sure the cheque is safe.
   * @returns Cheque address.
   */
  deriveChequeAddress = async (
    printerAddress: string,
    secureTokenAddress: string,
    strict: boolean = false,
  ) => {
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    const chequePublickKey = await findCheque(
      new web3.PublicKey(printerAddress),
      new web3.PublicKey(secureTokenAddress),
      this.program.provider.wallet.publicKey,
      this.program.programId,
    )
    const chequeAddress = chequePublickKey.toBase58()

    if (strict) {
      let onchainSecureTokenAddress: string
      try {
        const { secureToken } = await this.getChequeData(chequeAddress)
        onchainSecureTokenAddress = secureToken.toBase58()
      } catch (er) {
        throw new Error(
          `The cheque ${chequeAddress} may be not initialized yet`,
        )
      }
      if (secureTokenAddress !== onchainSecureTokenAddress)
        throw new Error('Violated cheque')
    }

    return chequeAddress
  }

  /**
   * Derive treasurer address of a printer by stable token address.
   * @param stableTokenAddress Stable token address.
   * @returns Treasurer address that holds the secure token treasuries of the printer.
   */
  deriveTreasurerAddress = async (stableTokenAddress: string) => {
    if (!isAddress(stableTokenAddress))
      throw new Error('Invalid stable token address')
    const stableTokenPublicKey = new web3.PublicKey(stableTokenAddress)
    const [treasurerPublicKey] = await web3.PublicKey.findProgramAddress(
      [stableTokenPublicKey.toBuffer()],
      this.program.programId,
    )
    return treasurerPublicKey.toBase58()
  }

  /**
   * Initialize a printer. This printer will generate & manage a stable token.
   * After the init, the authority can add certificate to accept the pair of secure token & stable token.
   * An number of secure tokens, which is verified by a certificate, is locked in the printer, a corresponding number of stable tokens would be printed and sent back.
   * @param printer (Optional) The printer keypair. If it's not provided, a new one will be auto generated.
   * @param decimals (Optional) Decimals for the stable token. Default is 6.
   * @param stableToken (Optional) The stable token keypair. If it's not provided, a new one will be auto generated.
   * @returns { txId, printerAddress, stableTokenAddress }
   */
  initializePrinter = async (
    printer: web3.Keypair = web3.Keypair.generate(),
    decimals: number = 6,
    stableToken: web3.Keypair = web3.Keypair.generate(),
  ) => {
    const treasurerAddress = await this.deriveTreasurerAddress(
      stableToken.publicKey.toBase58(),
    )
    const treasurerPublicKey = new web3.PublicKey(treasurerAddress)
    const txId = await this.program.rpc.initializePrinter(decimals, {
      accounts: {
        stableToken: stableToken.publicKey,
        authority: this._provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        treasurer: treasurerPublicKey,
        printer: printer.publicKey,
      },
      signers: [stableToken, printer],
    })
    return {
      txId,
      printerAddress: printer.publicKey.toBase58(),
      stableTokenAddress: stableToken.publicKey.toBase58(),
    }
  }

  /**
   * Create a certificate that allows the printer could print/burn a new secure token.
   * The ratio between the stable and secure token is defined by price.
   * 1 stable token = $1 = price / 10^6 * 1 secure_token
   * For example, if one secure token worths $0.75, then
   * 1 Stable Token = 1,333,333 / 1,000,000 * 0.75 so price = 1,333,333
   * @param printerAddress Printer address.
   * @param secureTokenAddress Secure token address.
   * @param taxmanAuthorityAddress Taxman authority (owner) address.
   * @param price Secure token price with decimals 6.
   * @param fee Burning Fee. Default is 5000 with decimals 6 (0.5%).
   * @returns { txId, certAddress }
   */
  initializeCert = async (
    printerAddress: string,
    secureTokenAddress: string,
    taxmanAuthorityAddress: string,
    price: BN,
    fee: BN = new BN(5000),
  ) => {
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    if (!isAddress(taxmanAuthorityAddress))
      throw new Error('Invalid taxman authority address')
    if (price.isZero() || price.isNeg())
      throw new Error('The price should be greater than zero')
    if (fee.isNeg()) throw new Error('The fee should not be negative')
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const certAddress = await this.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
    )
    const taxmanPublicKey = await utils.token.associatedAddress({
      mint: new web3.PublicKey(secureTokenAddress),
      owner: new web3.PublicKey(taxmanAuthorityAddress),
    })
    const txId = await this.program.rpc.initializeCert(price, fee, {
      accounts: {
        stableToken: stableTokenPublicKey,
        secureToken: new web3.PublicKey(secureTokenAddress),
        authority: this.program.provider.wallet.publicKey,
        printer: new web3.PublicKey(printerAddress),
        cert: new web3.PublicKey(certAddress),
        taxman: taxmanPublicKey,
        taxmanAuthority: new web3.PublicKey(taxmanAuthorityAddress),
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    return { txId, certAddress }
  }

  /**
   * Create a cheque that memorizes user's print & burn history.
   * @param printerAddress Printer address.
   * @param secureTokenAddress Secure token address.
   * @returns { txId, certAddress }
   */
  initializeCheque = async (
    printerAddress: string,
    secureTokenAddress: string,
  ) => {
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const chequeAddress = await this.deriveChequeAddress(
      printerAddress,
      secureTokenAddress,
    )
    const txId = await this.program.rpc.initializeCheque({
      accounts: {
        stableToken: stableTokenPublicKey,
        secureToken: new web3.PublicKey(secureTokenAddress),
        authority: this.program.provider.wallet.publicKey,
        printer: new web3.PublicKey(printerAddress),
        cheque: new web3.PublicKey(chequeAddress),
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    return { txId, chequeAddress }
  }

  /**
   * Print stable tokens by staking a number of secure tokens.
   * The printed amount is computed by the predefined numerator & denominator rate of the certification of the secure token.
   * @param amount Staking amount.
   * @param secureTokenAddress Secure token address.
   * @param printerAddress Printer Address.
   * @returns { txId, dstAddress }
   */
  print = async (
    amount: BN,
    secureTokenAddress: string,
    printerAddress: string,
  ) => {
    if (amount.isZero() || amount.isNeg())
      throw new Error('The amount should be greater than zero')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    const certAddress = await this.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
      true,
    )
    const chequeAddress = await this.deriveChequeAddress(
      printerAddress,
      secureTokenAddress,
      true,
    )
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const treasurerAddress = await this.deriveTreasurerAddress(
      stableTokenPublicKey.toBase58(),
    )
    const treasury = await utils.token.associatedAddress({
      owner: new web3.PublicKey(treasurerAddress),
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const srcAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const dstAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: stableTokenPublicKey,
    })
    const txId = await this.program.rpc.print(amount, {
      accounts: {
        secureToken: new web3.PublicKey(secureTokenAddress),
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer: new web3.PublicKey(treasurerAddress),
        treasury,
        srcAssociatedTokenAccount,
        dstAssociatedTokenAccount,
        printer: new web3.PublicKey(printerAddress),
        cert: new web3.PublicKey(certAddress),
        cheque: new web3.PublicKey(chequeAddress),
      },
    })
    return { txId, dstAddress: dstAssociatedTokenAccount.toBase58() }
  }

  /**
   * Burn stable tokens to get back a number of secure tokens.
   * The returned amount is computed by the predefined numerator & denominator rate of the certification of the secure token.
   * @param amount Burning amount.
   * @param secureTokenAddress Secure token address.
   * @param printerAddress Printer Address.
   * @returns { txId, dstAddress }
   */
  burn = async (
    amount: BN,
    secureTokenAddress: string,
    printerAddress: string,
  ) => {
    if (amount.isZero() || amount.isNeg())
      throw new Error('The amount should be greater than zero')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    const certAddress = await this.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
      true,
    )
    const chequeAddress = await this.deriveChequeAddress(
      printerAddress,
      secureTokenAddress,
      true,
    )
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const { taxman } = await this.getCertData(certAddress)
    const treasurerAddress = await this.deriveTreasurerAddress(
      stableTokenPublicKey.toBase58(),
    )
    const treasury = await utils.token.associatedAddress({
      owner: new web3.PublicKey(treasurerAddress),
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const srcAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: stableTokenPublicKey,
    })
    const dstAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const txId = await this.program.rpc.burn(amount, {
      accounts: {
        secureToken: new web3.PublicKey(secureTokenAddress),
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        treasurer: new web3.PublicKey(treasurerAddress),
        treasury,
        srcAssociatedTokenAccount,
        dstAssociatedTokenAccount,
        printer: new web3.PublicKey(printerAddress),
        cert: new web3.PublicKey(certAddress),
        cheque: new web3.PublicKey(chequeAddress),
        taxman,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    return { txId, dstAddress: dstAssociatedTokenAccount.toBase58() }
  }

  /**
   * Set new state for a certification.
   * @param state The new state.
   * @param certAddress Certificate address.
   * @returns { txId }
   */
  setCertState = async (state: CertState, certAddress: string) => {
    if (!isAddress(certAddress)) throw new Error('Invalid cert address')
    const { printer: printerPublicKey, secureToken: secureTokenPublicKey } =
      await this.getCertData(certAddress)
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerPublicKey.toBase58(),
    )
    const txId = await this.program.rpc.setCertState(state, {
      accounts: {
        secureToken: secureTokenPublicKey,
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        printer: printerPublicKey,
        cert: new web3.PublicKey(certAddress),
      },
    })
    return { txId }
  }

  /**
   * Set new fee for a certification.
   * @param fee The new fee.
   * @param certAddress Certificate address.
   * @returns { txId }
   */
  setCertFee = async (fee: BN, certAddress: string) => {
    if (fee.isNeg()) throw new Error('The fee should not be negative')
    if (!isAddress(certAddress)) throw new Error('Invalid cert address')
    const { printer: printerPublicKey, secureToken: secureTokenPublicKey } =
      await this.getCertData(certAddress)
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerPublicKey.toBase58(),
    )
    const txId = await this.program.rpc.setCertFee(fee, {
      accounts: {
        secureToken: secureTokenPublicKey,
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        printer: printerPublicKey,
        cert: new web3.PublicKey(certAddress),
      },
    })
    return { txId }
  }

  /**
   * Set new taxman for a certification.
   * @param taxmanAuthority The new taxman authority (the function will auto derive the taxman account for the authority).
   * @param certAddress Certificate address.
   * @returns { txId }
   */
  setCertTaxman = async (taxmanAuthority: string, certAddress: string) => {
    if (!isAddress(taxmanAuthority))
      throw new Error('Invalid taxman authority address')
    if (!isAddress(certAddress)) throw new Error('Invalid cert address')
    const { printer: printerPublicKey, secureToken: secureTokenPublicKey } =
      await this.getCertData(certAddress)
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerPublicKey.toBase58(),
    )
    const taxmanPublicKey = await utils.token.associatedAddress({
      mint: secureTokenPublicKey,
      owner: new web3.PublicKey(taxmanAuthority),
    })
    const txId = await this.program.rpc.setCertTaxman({
      accounts: {
        secureToken: secureTokenPublicKey,
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        printer: printerPublicKey,
        cert: new web3.PublicKey(certAddress),
        taxman: taxmanPublicKey,
        taxmanAuthority: new web3.PublicKey(taxmanAuthority),
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    })
    return { txId }
  }
}

export * from '../target/types/project_kylan'
export * from './constant'
export * from './utils'
export default Kylan
