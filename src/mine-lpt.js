require('dotenv').config()
const Web3 = require('web3')
const redis = require('redis')
const bluebird = require('bluebird')
const fetch = require('node-fetch')
const { addHexPrefix } = require('ethereumjs-util')
bluebird.promisifyAll(redis)

const MerkleMineBulkArtifact = require('../MerkleMineBulkArtifact.json')
const TxKeyManager = require('../../merkle-mine/client/lib/TxKeyManager')
const MerkleMineGenerator = require('../../merkle-mine/client/lib/MerkleMineGenerator')

const buildMerkleTree = require('./buildMerkleTree.js')

const GAS_PRICE = process.env.GAS_PRICE
const YOUR_ADDRESS = process.env.YOUR_ADDRESS
const KEY_LOCATION = process.env.KEY_LOCATION
const KEY_PASSWORD = process.env.KEY_PASSWORD
const NUMBER_OF_LOOPS = process.env.NUMBER_OF_LOOPS
const NUMBER_ADDRESS_PER_TXN = process.env.NUMBER_ADDRESS_PER_TXN

const mineLpt = async (gasPrice, merkleTree) => {
  const client = redis.createClient()

  const provider = new Web3.providers.HttpProvider('https://mainnet.infura.io')
  const merkleMineAddress = '0x8e306b005773bee6ba6a6e8972bc79d766cc15c8'

  console.log('Using the Ethereum main network, Merkle Mine contract: ' + merkleMineAddress)
  if (merkleTree == null) {
    merkleTree = await buildMerkleTree()
  }
  if (gasPrice == null) {
    gasPrice = GAS_PRICE
  }

  const txKeyManager = new TxKeyManager(KEY_LOCATION, YOUR_ADDRESS)
  await txKeyManager.unlock(KEY_PASSWORD)

  let i = 0
  const txnHashes = []
  while (i < NUMBER_OF_LOOPS) {
    const { toclaim, hexproofs } = await getAddressesAndProofs(provider, merkleTree, merkleMineAddress)
    console.log('submitting with gas price of ' + gasPrice)
    const hash = await submitProof(YOUR_ADDRESS, toclaim, extendedBufArrToHex(hexproofs), txKeyManager, gasPrice, client)
    txnHashes.push(hash)
    i++
  }

  return txnHashes
}

const fetchAccounts = async () => {
  let accounts
  let attempts = 0

  async function tryFetchAndParse() {
    try {
      const one = await fetch('https://568kysoy9c.execute-api.us-east-1.amazonaws.com/prod/random-accounts')
      // const two = await fetch('https://568kysoy9c.execute-api.us-east-1.amazonaws.com/prod/random-accounts')
      // const three = await fetch('https://568kysoy9c.execute-api.us-east-1.amazonaws.com/prod/random-accounts')

      const onej = JSON.parse((await one.json()).body)
      // const twoj = JSON.parse((await two.json()).body)
      // const threej = JSON.parse((await three.json()).body)

      // accounts = onej.concat(twoj, threej)
      accounts = onej
      console.log('Got ' + accounts.length + ' accounts to mine.')
      return accounts
    } catch (e) {
      console.log('error parsing json; aws endpoint probably returned bad data or failed to respond..trying again')
      if (attempts < 5) {
        attempts++
        return tryFetchAndParse()
      } else {
        console.log('tried to fetch random accounts and parse 5 times without success; try again later')
        proess.exit(1)
      }
    }
  }
  return tryFetchAndParse()
}

const getAddressesAndProofs = async (provider, merkleTree, merkleMineAddress) => {
  const accounts = await fetchAccounts()

  const toclaim = []
  const hexproofs = []

  for (let i = 0; i < accounts.length; i++) {
    try {
      if (toclaim.length < NUMBER_ADDRESS_PER_TXN) {
        const hexAddr = accounts[i].toLowerCase()
        i++
        const gen = new MerkleMineGenerator(provider, merkleTree, merkleMineAddress, hexAddr)

        const merkleMine = await gen.getMerkleMine()
        const generated = await merkleMine.methods.generated(hexAddr).call()

        if (generated) {
          console.log(`Allocation for ${hexAddr} already generated!`)
        } else {
          console.log(`Allocation for ${hexAddr} *NOT* already generated!`)
          const proof = merkleTree.getHexProof(hexAddr)
          toclaim.push(hexAddr)
          hexproofs.push(proof.substr(2))
        }
      }
    } catch (ex) {
      console.log(ex)
    }
  }
  return {
    toclaim,
    hexproofs
  }
}

const submitProof = (callerAddress, addressList, merkleProofs, txKeyManager, gasPrice, redisClient) => {
  return new Promise(async (resolve, reject) => {
    const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io'))
    const merkleBulkAddress = '0x182EBF4C80B28efc45AD992ecBb9f730e31e8c7F'
    const bulkMerkleMiner = new web3.eth.Contract(MerkleMineBulkArtifact.abi, merkleBulkAddress)

    try {
      console.log('Generating txn for ' + addressList.length)
      const generateFn = bulkMerkleMiner.methods.multiGenerate('8e306b005773bee6ba6a6e8972bc79d766cc15c8', addressList, merkleProofs)

      const data = generateFn.encodeABI()
      let nonce = await web3.eth.getTransactionCount(callerAddress)
      let nonceR = parseInt(await redisClient.getAsync('eth_redis_nonce'))
      if (nonceR && nonceR > nonce) {
        nonce = nonceR
      }
      const networkId = await web3.eth.net.getId()

      console.log('signing tx at ' + nonce)

      const signedTx = txKeyManager.signTransaction({
        nonce: nonce,
        gasPrice: gasPrice,
        gasLimit: 170000 * addressList.length,
        to: addHexPrefix(merkleBulkAddress),
        value: 0,
        data: data,
        chainId: networkId
      })

      web3.eth.sendSignedTransaction(signedTx).on('transactionHash', txHash => {
        console.log(`Submitted tx ${txHash} to generate allocation for ${callerAddress} from ${callerAddress}`)
        nonce++
        redisClient.set('eth_redis_nonce', nonce)
        resolve(txHash)
      })
    } catch (ex) {
      console.log('big error')
      console.log(ex)
      reject()
    }
  })
}

/*
HELPERS
 */

const encodeProofSize = proof => {
  const proofSize = proof.length / 2

  let res = proofSize.toString('16')
  let len = res.length

  while (len < 64) {
    res = '0' + res
    len++
  }

  return res
}

const extendedBufArrToHex = proofs => {
  return (
    '0x' +
    proofs
      .map(proof => {
        return encodeProofSize(proof) + proof
      })
      .join('')
  )
}

module.exports = mineLpt
