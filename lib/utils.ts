import { web3 } from '@project-serum/anchor'

/**
 * Validate an address
 * @param address Base58 string
 * @returns true/false
 */
export const isAddress = (address: string | undefined): address is string => {
  if (!address) return false
  try {
    const publicKey = new web3.PublicKey(address)
    if (!publicKey) throw new Error('Invalid public key')
    return true
  } catch (er) {
    return false
  }
}

/**
 * Find the cert based on canonical bump
 * @param printerPublicKey
 * @param secureTokenPublicKey
 * @param programId
 * @returns
 */
export const findCert = async (
  printerPublicKey: web3.PublicKey,
  secureTokenPublicKey: web3.PublicKey,
  programId: web3.PublicKey,
) => {
  const [cert] = await web3.PublicKey.findProgramAddress(
    [
      Buffer.from('cert'),
      printerPublicKey.toBuffer(),
      secureTokenPublicKey.toBuffer(),
    ],
    programId,
  )
  return cert
}

/**
 * Find the cheque based on canonical bump
 * @param printerPublicKey
 * @param secureTokenPublicKey
 * @param authorityPublicKey
 * @param programId
 * @returns
 */
export const findCheque = async (
  printerPublicKey: web3.PublicKey,
  secureTokenPublicKey: web3.PublicKey,
  authorityPublicKey: web3.PublicKey,
  programId: web3.PublicKey,
) => {
  const [cheque] = await web3.PublicKey.findProgramAddress(
    [
      Buffer.from('cheque'),
      printerPublicKey.toBuffer(),
      secureTokenPublicKey.toBuffer(),
      authorityPublicKey.toBuffer(),
    ],
    programId,
  )
  return cheque
}
