### 1.0.0 (2021-08-27)

##### Initial commit

- Added method to generate keyring
- Added method to restore a keyring
- Added method to add a new account to the keyring object
- Added method to export the private key of an address
- Added method to sign a transaction
- Added method to sign a message
- Added method to sign Typed Data (EIP-712)

### 1.0.1 (2021-11-19)

##### EIP-1559 transaction signing

- Added support for EIP-1559 transaction signing

### 1.0.2 (2022-01-21)

##### Implement import wallet functionality

- Added importWallet() to import account using privateKey.

### 1.1.0 (2022-02-16)

##### Implement get balance functionality

- Added getBalance() to fetch the balance in native currency.

### 1.2.0 (2022-03-05)

##### Implement sign functionality

- Added sign() to sign a message or transaction and get signature along with v,r,s.

### 1.3.0 (2022-04-12)

##### Implement transaction broadcast functionality

- Added `sendTransaction()` function to send a signed transaction to the blockchain.

### 1.4.0 (2022-04-12)

##### Function to get the transaction fees

- Added `getFees()` function to get the transaction fees for a raw transaction object.

### 1.4.1 (2023-03-15)

##### Upated @ethereumjs/common implementation 

- Upated `@ethereumjs/common` implementation for `signTransaction` method

### 1.4.2 (2023-05-17)

- Update importWallet method

### 1.4.3 (2023-06-21)

- update import wallet to accept private key with or without '0x’ prefixed

### 1.4.4 (2023-06-23)

- update sign transaction to accept private key in case of imported wallet, null by default


### 1.4.5 (2023-07-05)

- Adding badges for Readme.md


### 1.4.6 (2023-11-28)

- Added test suite
- Upgraded node version to 18.x