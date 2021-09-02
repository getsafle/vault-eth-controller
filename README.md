# Vault Eth Controller

The vault-eth-controller package houses methods to generate a solana wallet and operational methods like signing/broadcast transaction, sign messages, export keys, etc. This sdk maintains a keyring state which houses multiple accounts derived from the same mnemonic.

## Install

`npm install --save @getsafle/vault-eth-controller`

## Initialize the Eth Controller class

```
const controller = require('@getsafle/vault-eth-controller');

const ethController = new controller({
  encryptor: {
    // An optional object for defining encryption schemes:
    // Defaults to Browser-native SubtleCrypto.
    encrypt(password, object) {
      return new Promise('encrypted!');
    },
    decrypt(password, encryptedString) {
      return new Promise({ foo: 'bar' });
    },
  },
});
```

## Methods

### Generate Keyring with 1 account and encrypt

```
const keyringState = await ethController.createNewVaultAndKeychain(password);
```

### Restore a keyring with the first account using a mnemonic

```
const keyringState = await ethController.createNewVaultAndRestore(password, mnemonic);
```

### Add a new account to the keyring object

```
const keyringState = await ethController.addNewAccount(keyringObject);
```

### Export the private key of an address present in the keyring

```
const privateKey = await ethController.exportAccount(address);
```

### Sign a transaction

```
const signedTx = await ethController.signTransaction(ethTx, _fromAddress);
```

### Sign a message

```
const signedMsg = await ethController.signMessage(msgParams);
```

### Sign Typed Data (EIP-712)

```
const signedData = await ethController.signTypedMessage (msgParams);
```
