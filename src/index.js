
const { EventEmitter } = require('events')
const log = require('loglevel')
const ethUtil = require('ethereumjs-util')
const { FeeMarketEIP1559Transaction } = require('@ethereumjs/tx');
const Common = require('@ethereumjs/common').default;
const { Hardfork } = require('@ethereumjs/common');
const { bufferToHex } = require('ethereumjs-util')

const bip39 = require('bip39')
const ObservableStore = require('obs-store')
const encryptor = require('browser-passworder')
const { normalize: normalizeAddress } = require('eth-sig-util')

const SimpleKeyring = require('eth-simple-keyring')
const HdKeyring = require('eth-hd-keyring')

const keyringTypes = [
  SimpleKeyring,
  HdKeyring,
]

class KeyringController extends EventEmitter {

  //
  // PUBLIC METHODS
  //

  constructor(opts) {
    super()
    const initState = opts.initState || {}
    this.keyringTypes = opts.keyringTypes ? keyringTypes.concat(opts.keyringTypes) : keyringTypes
    this.store = new ObservableStore(initState)
    this.memStore = new ObservableStore({
      isUnlocked: false,
      keyringTypes: this.keyringTypes.map((krt) => krt.type),
      keyrings: [],
    })

    this.encryptor = opts.encryptor || encryptor
    this.keyrings = []
    this.getNetwork = opts.getNetwork
    this.importedWallets = []
  }

  /**
   * Full Update
   *
   * Emits the `update` event and @returns a Promise that resolves to
   * the current state.
   *
   * Frequently used to end asynchronous chains in this class,
   * indicating consumers can often either listen for updates,
   * or accept a state-resolving promise to consume their results.
   *
   * @returns {Object} The controller state.
   */
  fullUpdate() {
    this.emit('update', this.memStore.getState())
    return this.memStore.getState()
  }

  /**
   * Create New Vault And Keychain
   *
   * Destroys any old encrypted storage,
   * creates a new encrypted store with the given password,
   * randomly creates a new HD wallet with 1 account,
   * faucets that account on the testnet.
   *
   * @emits KeyringController#unlock
   * @param {string} password - The password to encrypt the vault with.
   * @returns {Promise<Object>} A Promise that resolves to the state.
   */
  createNewVaultAndKeychain(password) {
    return this.persistAllKeyrings(password)
      .then(this.createFirstKeyTree.bind(this))
      .then(this.persistAllKeyrings.bind(this, password))
      .then(this.setUnlocked.bind(this))
      .then(this.fullUpdate.bind(this))
  }

  /**
   * CreateNewVaultAndRestore
   *
   * Destroys any old encrypted storage,
   * creates a new encrypted store with the given password,
   * creates a new HD wallet from the given seed with 1 account.
   *
   * @emits KeyringController#unlock
   * @param {string} password - The password to encrypt the vault with
   * @param {string} seed - The BIP44-compliant seed phrase.
   * @returns {Promise<Object>} A Promise that resolves to the state.
   */
  createNewVaultAndRestore(password, seed) {
    if (typeof password !== 'string') {
      return Promise.reject(new Error('Password must be text.'))
    }

    if (!bip39.validateMnemonic(seed)) {
      return Promise.reject(new Error('Seed phrase is invalid.'))
    }

    this.clearKeyrings()

    return this.persistAllKeyrings(password)
      .then(() => {
        return this.addNewKeyring('HD Key Tree', {
          mnemonic: seed,
          numberOfAccounts: 1,
        })
      })
      .then((firstKeyring) => {
        return firstKeyring.getAccounts()
      })
      .then(([firstAccount]) => {
        if (!firstAccount) {
          throw new Error('KeyringController - First Account not found.')
        }
        return null
      })
      .then(this.persistAllKeyrings.bind(this, password))
      .then(this.setUnlocked.bind(this))
      .then(this.fullUpdate.bind(this))
  }

  /**
   * Add New Keyring
   *
   * Adds a new Keyring of the given `type` to the vault
   * and the current decrypted Keyrings array.
   *
   * All Keyring classes implement a unique `type` string,
   * and this is used to retrieve them from the keyringTypes array.
   *
   * @param {string} type - The type of keyring to add.
   * @param {Object} opts - The constructor options for the keyring.
   * @returns {Promise<Keyring>} The new keyring.
   */
  addNewKeyring(type, opts) {
    const Keyring = this.getKeyringClassForType(type)
    const keyring = new Keyring(opts)
    return keyring.getAccounts()
      .then((accounts) => {
        return this.checkForDuplicate(type, accounts)
      })
      .then(() => {
        this.keyrings.push(keyring)
        return this.persistAllKeyrings()
      })
      .then(() => this._updateMemStoreKeyrings())
      .then(() => this.fullUpdate())
      .then(() => {
        return keyring
      })
  }

  /**
   * Checks for duplicate keypairs, using the the first account in the given
   * array. Rejects if a duplicate is found.
   *
   * Only supports 'Simple Key Pair'.
   *
   * @param {string} type - The key pair type to check for.
   * @param {Array<string>} newAccountArray - Array of new accounts.
   * @returns {Promise<Array<string>>} The account, if no duplicate is found.
   */
  checkForDuplicate(type, newAccountArray) {
    return this.getAccounts()
      .then((accounts) => {
        switch (type) {
          case 'Simple Key Pair': {
            const isIncluded = Boolean(
              accounts.find(
                (key) => (
                  key === newAccountArray[0] ||
                  key === ethUtil.stripHexPrefix(newAccountArray[0])),
              ),
            )
            return isIncluded
              ? Promise.reject(new Error('The account you\'re are trying to import is a duplicate'))
              : Promise.resolve(newAccountArray)
          }
          default: {
            return Promise.resolve(newAccountArray)
          }
        }
      })
  }

  /**
   * Add New Account
   *
   * Calls the `addAccounts` method on the given keyring,
   * and then saves those changes.
   *
   * @param {Keyring} selectedKeyring - The currently selected keyring.
   * @returns {Promise<Object>} A Promise that resolves to the state.
   */
  addNewAccount(selectedKeyring) {
    return selectedKeyring.addAccounts(1)
      .then((accounts) => {
        accounts.forEach((hexAccount) => {
          this.emit('newAccount', hexAccount)
        })
      })
      .then(this.persistAllKeyrings.bind(this))
      .then(this._updateMemStoreKeyrings.bind(this))
      .then(this.fullUpdate.bind(this))
  }

  /**
   * Export Account
   *
   * Requests the private key from the keyring controlling
   * the specified address.
   *
   * Returns a Promise that may resolve with the private key string.
   *
   * @param {string} address - The address of the account to export.
   * @returns {Promise<string>} The private key of the account.
   */
  exportAccount(address) {
    try {
      return this.getKeyringForAccount(address)
        .then((keyring) => {
          return keyring.exportAccount(normalizeAddress(address))
        })
    } catch (e) {
      return Promise.reject(e)
    }
  }

  importWallet(_privateKey) {
    try {
      const privateKey = ethUtil.toBuffer(_privateKey)
      if (!ethUtil.isValidPrivate(privateKey))
        throw "Enter a valid private key"

      const address = ethUtil.bufferToHex(ethUtil.privateToAddress(privateKey))
      this.importedWallets.push(address);
      return address
    } catch (e) {
      return Promise.reject(e)
    }
  }

  //
  // SIGNING METHODS
  //

  /**
   * Sign Ethereum Transaction
   *
   * Signs an Ethereum transaction object.
   *
   * @param {Object} ethTx - The transaction to sign.
   * @param {string} _fromAddress - The transaction 'from' address.
   * @param {Object} opts - Signing options.
   * @returns {Promise<Object>} The signed transactio object.
   */
  signTransaction(ethTx, _fromAddress, opts = {}) {
    const fromAddress = normalizeAddress(_fromAddress)
    return this.getKeyringForAccount(fromAddress)
      .then((keyring) => {
        return keyring.signTransaction(fromAddress, ethTx, opts)
      })
  }

  /**
   * Sign Message
   *
   * Attempts to sign the provided message parameters.
   *
   * @param {Object} msgParams - The message parameters to sign.
   * @returns {Promise<Buffer>} The raw signature.
   */
  signMessage(msgParams, opts = {}) {
    const address = normalizeAddress(msgParams.from)
    return this.getKeyringForAccount(address)
      .then((keyring) => {
        return keyring.signMessage(address, msgParams.data, opts)
      })
  }

  /**
   * Sign Typed Data
   * (EIP712 https://github.com/ethereum/EIPs/pull/712#issuecomment-329988454)
   *
   * @param {Object} msgParams - The message parameters to sign.
   * @returns {Promise<Buffer>} The raw signature.
   */
  signTypedMessage(msgParams, opts = { version: 'V1' }) {
    const address = normalizeAddress(msgParams.from)
    return this.getKeyringForAccount(address)
      .then((keyring) => {
        return keyring.signTypedData(address, msgParams.data, opts)
      })
  }

  //
  // PRIVATE METHODS
  //

  /**
   * Create First Key Tree
   *
   * - Clears the existing vault
   * - Creates a new vault
   * - Creates a random new HD Keyring with 1 account
   * - Makes that account the selected account
   * - Faucets that account on testnet
   * - Puts the current seed words into the state tree
   *
   * @returns {Promise<void>} - A promise that resovles if the operation was successful.
   */
  createFirstKeyTree() {
    this.clearKeyrings()
    return this.addNewKeyring('HD Key Tree', { numberOfAccounts: 1 })
      .then((keyring) => {
        return keyring.getAccounts()
      })
      .then(([firstAccount]) => {
        if (!firstAccount) {
          throw new Error('KeyringController - No account found on keychain.')
        }
        const hexAccount = normalizeAddress(firstAccount)
        this.emit('newVault', hexAccount)
        return null
      })
  }

  /**
   * Persist All Keyrings
   *
   * Iterates the current `keyrings` array,
   * serializes each one into a serialized array,
   * encrypts that array with the provided `password`,
   * and persists that encrypted string to storage.
   *
   * @param {string} password - The keyring controller password.
   * @returns {Promise<boolean>} Resolves to true once keyrings are persisted.
   */
  persistAllKeyrings(password = this.password) {
    if (typeof password !== 'string') {
      return Promise.reject(new Error(
        'KeyringController - password is not a string',
      ))
    }

    this.password = password
    return Promise.all(this.keyrings.map((keyring) => {
      return Promise.all([keyring.type, keyring.serialize()])
        .then((serializedKeyringArray) => {
          // Label the output values on each serialized Keyring:
          return {
            type: serializedKeyringArray[0],
            data: serializedKeyringArray[1],
          }
        })
    }))
      .then((serializedKeyrings) => {
        return this.encryptor.encrypt(this.password, serializedKeyrings)
      })
      .then((encryptedString) => {
        this.store.updateState({ vault: encryptedString })
        return true
      })
  }

  getKeyringClassForType(type) {
    return this.keyringTypes.find((kr) => kr.type === type)
  }

  /**
   * Get Keyrings by Type
   *
   * Gets all keyrings of the given type.
   *
   * @param {string} type - The keyring types to retrieve.
   * @returns {Array<Keyring>} The keyrings.
   */
  getKeyringsByType(type) {
    return this.keyrings.filter((keyring) => keyring.type === type)
  }

  /**
   * Get Accounts
   *
   * Returns the public addresses of all current accounts
   * managed by all currently unlocked keyrings.
   *
   * @returns {Promise<Array<string>>} The array of accounts.
   */
  async getAccounts() {
    const keyrings = this.keyrings || []
    const addrs = await Promise.all(keyrings.map((kr) => kr.getAccounts()))
      .then((keyringArrays) => {
        return keyringArrays.reduce((res, arr) => {
          return res.concat(arr)
        }, [])
      })
    return addrs.map(normalizeAddress)
  }

  async signTransaction(rawTx, web3) {
    let chain;

    await web3.eth.getChainId().then((e) => chain = e);

    const privateKey = await this.exportAccount(rawTx.from);

    const pkey = Buffer.from(privateKey, 'hex');

    const common = new Common({ chain, hardfork: Hardfork.London });

    const tx = FeeMarketEIP1559Transaction.fromTxData(rawTx, { common });

    const signedTransaction = tx.sign(pkey);

    const signedTx = bufferToHex(signedTransaction.serialize());

    return signedTx
  }

  /**
   * Sign Transaction or Message to get v,r,s
   *
   * Signs a transaction object.
   *
   * @param {Object} rawTx - The transaction or message to sign.
   * @param {Object} privateKey - The private key of the account.
   * @param {Object} web3 - web3 object.
   * @returns {Object} The signed transaction object.
   */
  async sign(rawTx, privateKey, web3) {
    let signedTx;
    if (typeof rawTx === 'string')
      signedTx = await web3.eth.accounts.sign(rawTx, privateKey);
    else
      signedTx = await web3.eth.accounts.signTransaction({ ...rawTx, gas: await web3.eth.estimateGas(rawTx) }, privateKey)
    return signedTx
  }

  /**
   * Get Keyring For Account
   *
   * Returns the currently initialized keyring that manages
   * the specified `address` if one exists.
   *
   * @param {string} address - An account address.
   * @returns {Promise<Keyring>} The keyring of the account, if it exists.
   */
  getKeyringForAccount(address) {
    const hexed = normalizeAddress(address)
    log.debug(`KeyringController - getKeyringForAccount: ${hexed}`)

    return Promise.all(this.keyrings.map((keyring) => {
      return Promise.all([
        keyring,
        keyring.getAccounts(),
      ])
    }))
      .then((candidates) => {
        const winners = candidates.filter((candidate) => {
          const accounts = candidate[1].map(normalizeAddress)
          return accounts.includes(hexed)
        })
        if (winners && winners.length > 0) {
          return winners[0][0]
        }
        throw new Error('No keyring found for the requested account.')

      })
  }

  /**
   * Display For Keyring
   *
   * Is used for adding the current keyrings to the state object.
   * @param {Keyring} keyring
   * @returns {Promise<Object>} A keyring display object, with type and accounts properties.
   */
  displayForKeyring(keyring) {
    return keyring.getAccounts()
      .then((accounts) => {
        return {
          type: keyring.type,
          accounts: accounts.map(normalizeAddress),
        }
      })
  }

  /**
   * Clear Keyrings
   *
   * Deallocates all currently managed keyrings and accounts.
   * Used before initializing a new vault.
   */
  /* eslint-disable require-await */
  async clearKeyrings() {
    // clear keyrings from memory
    this.keyrings = []
    this.memStore.updateState({
      keyrings: [],
    })
  }

  /**
   * Update Memstore Keyrings
   *
   * Updates the in-memory keyrings, without persisting.
   */
  async _updateMemStoreKeyrings() {
    const keyrings = await Promise.all(this.keyrings.map(this.displayForKeyring))
    return this.memStore.updateState({ keyrings })
  }

  /**
   * Unlock Keyrings
   *
   * Unlocks the keyrings.
   *
   * @emits KeyringController#unlock
   */
  setUnlocked() {
    this.memStore.updateState({ isUnlocked: true })
    this.emit('unlock')
  }

  async sendTransaction(signedTx, web3) {
    const receipt = await web3.eth.sendSignedTransaction(signedTx);
    return { transactionDetails: receipt.transactionHash }
  }

  async getFees(rawTx, web3) {
    const { from, to, value, data, gasLimit, maxFeePerGas } = rawTx
    const estimate = gasLimit ? gasLimit : await web3.eth.estimateGas({ to, from, value, data });

    const re = /[0-9A-Fa-f]{6}/g;

    const maxFee = (re.test(maxFeePerGas)) ? parseInt(maxFeePerGas, 16) : maxFeePerGas;

    const gas = (re.test(estimate)) ? parseInt(estimate, 16) : estimate
    
    return { transactionFees: web3.utils.fromWei((gas * maxFee).toString(), 'ether') }
  }
}

const getBalance = async (address, web3) => {
  const balance = await web3.eth.getBalance(address);
  return { balance: web3.utils.fromWei(balance, 'ether') }
}

module.exports = { KeyringController, getBalance }