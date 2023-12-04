var assert = require('assert');
const Web3 = require('web3')
const bridgeContract = require('./contract-json/BridgeEth.json');
const CryptoJS = require('crypto-js');
const { KeyringController: ETHKeyring, getBalance } = require('../src/index')
const {
    HD_WALLET_12_MNEMONIC,
    HD_WALLET_12_MNEMONIC_TEST_OTHER,
    TESTING_MESSAGE_1,
    TESTING_MESSAGE_2,
    TESTING_MESSAGE_3,
    EXTERNAL_ACCOUNT_PRIVATE_KEY,
    EXTERNAL_ACCOUNT_ADDRESS,
    EXTERNAL_ACCOUNT_WRONG_PRIVATE_KEY_1,
    EXTERNAL_ACCOUNT_WRONG_PRIVATE_KEY_2,
    EXTERNAL_ACCOUNT_WRONG_PRIVATE_KEY_3,
    EXTERNAL_ACCOUNT_ADDRESS_TO_GET_FEE,
    ETH_NETWORK: {
        TESTNET,
        MAINNET
    },
    TRANSFER_ETH: {
        ETH_AMOUNT,
        ETH_RECEIVER
    },
    CONTRACT_TXN: {
        ETH_CONTRACT,
        ETH_AMOUNT_TO_CONTRACT
    },
} = require('./constants');

const CONTRACT_MINT_PARAM = {
    from: ETH_CONTRACT,
    to: '', // this will be the current account 
    amount: 1,
    nonce: 0,
    signature: [72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 220, 122]
}

const opts = {
    encryptor: {
        encrypt(pass, object) {
            const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(object), pass).toString();

            return ciphertext;
        },
        decrypt(pass, encryptedString) {
            const bytes = CryptoJS.AES.decrypt(encryptedString, pass);
            const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

            return decryptedData;
        },
    },
}

const opts_empty = {}

const PASSWORD = "random_password"

/**
 * Transaction object type
 * {    from: from address,
        to: to address,
        value: amount (in wei),
        data: hex string}
 */

describe('Initialize wallet ', () => {
    const ethKeyring = new ETHKeyring(opts)

    it("Create new vault and keychain", async () => {
        const res = await ethKeyring.createNewVaultAndKeychain(PASSWORD)
        console.log("res ", res)
    })

    it("Create new vault and restore", async () => {
        const res = await ethKeyring.createNewVaultAndRestore(PASSWORD, HD_WALLET_12_MNEMONIC)
        assert(ethKeyring.keyrings[0].mnemonic === HD_WALLET_12_MNEMONIC, "Wrong mnemonic")
    })

    it("Export account (privateKey)", async () => {
        const res = await ethKeyring.getAccounts()
        let account = res[0]
        const accRes = await ethKeyring.exportAccount(account)
        console.log("accRes ", accRes, Buffer.from(accRes, 'hex'))
    })

    it("Get accounts", async () => {
        const acc = await ethKeyring.getAccounts()
        console.log("acc ", acc)
    })


    it("Get fees", async () => {
        const web3 = new Web3(TESTNET.URL);
        const rawTx = {
            to: '0xca878f65d50caf80a84fb24e40f56ef05483e1cb',
            from: EXTERNAL_ACCOUNT_ADDRESS_TO_GET_FEE,
            value: web3.utils.numberToHex(web3.utils.toWei('0.01', 'ether')),
            data: '0x00',
            chainId: 5,
        };

        const response = await ethKeyring.getFees(rawTx, web3)
        let fees = Object.keys(response.fees)
        let expectedFees = ["slow", "standard", "fast", "baseFee"]

        assert.deepEqual(fees, expectedFees, "Should have slow, standard, fast and base fee")

    })

    it("Should import correct account ", async () => {
        const address = await ethKeyring.importWallet(EXTERNAL_ACCOUNT_PRIVATE_KEY)
        assert(address.toLowerCase() === EXTERNAL_ACCOUNT_ADDRESS.toLowerCase(), "Wrong address")
        assert(ethKeyring.importedWallets.length === 1, "Should have 1 imported wallet")
    })

    it("Get address balance", async () => {
        const accounts = await ethKeyring.getAccounts()
        const web3 = new Web3(TESTNET.URL);
        const balance = await getBalance(accounts[0], web3)
        console.log(" get balance ", balance, accounts)
    })

    it("sign Transaction ", async () => {

        const accounts = await ethKeyring.getAccounts()
        const from = accounts[0]
        const web3 = new Web3(TESTNET.URL);

        const count = await web3.eth.getTransactionCount(from);

        const defaultNonce = await web3.utils.toHex(count);

        const rawTx = {
            to: '0xca878f65d50caf80a84fb24e40f56ef05483e1cb',
            from,
            value: web3.utils.numberToHex(web3.utils.toWei('0.01', 'ether')),
            gasLimit: web3.utils.numberToHex(25000),
            maxPriorityFeePerGas: web3.utils.numberToHex(web3.utils.toWei('55', 'gwei')),
            maxFeePerGas: web3.utils.numberToHex(web3.utils.toWei('56', 'gwei')),
            nonce: defaultNonce,
            data: '0x00',
            type: '0x2',
            chainId: 5,
        };

        const privateKey = await ethKeyring.exportAccount(accounts[0])
        const signedTX = await ethKeyring.signTransaction(rawTx, web3, privateKey)
        assert(signedTX)

    })

})