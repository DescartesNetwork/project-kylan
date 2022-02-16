import { web3 } from '@project-serum/anchor'

/**
 * Find the search based on canonical bump
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
