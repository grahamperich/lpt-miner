# lpt-miner

Simple LPT miner implementation. Pay gas to mine LPT automagically. Creates merkle proofs and submits them to the contract. Set the `.env` file based on how many times you want to loop through the mining logic. Tested on macOS. Likely works on linux too but your mileage may vary.

## Requirements

- NodeJS >= 8.4.0
- Redis
- An ethereum [keystore file](https://medium.com/@julien.maffre/what-is-an-ethereum-keystore-file-86c8c5917b97)

## How To

1.  If you don't have redis installed, run `brew install redis`
2.  Start your redis server `redis-server`
3.  In this directory, run `npm install`
4.  Clone https://github.com/livepeer/merkle-mine.git in an adjacent directory and run `npm install`.
5.  In this directory, at the top level, create a new directory called `keys/`. In this new `keys/` directory, copy over your ethereum `keystore/` folder with the keystore file inside. Keystore file should use the canonical file name scheme e.g. `UTC--2015-08-11T061353.359Z--address`. If you need to generate a keystore file, I recommend using [MyCrypto](https://mycrypto.com/).
6.  Set your `.env` file appropriately. There is a `.env.example` included in this repo. You can just set your values in there and then rename the file to remove the `.example` extension. Remember, higher gas = more expensive to mine, but no risk of your transactions hanging in limbo while miners chuckle at your low gas price. I recommend checking what the Standard (<5m) gas price is on [Ethgasstation](https://ethgasstation.info/) and setting your `GAS_PRICE` a bit higher.
7.  run `node just-mine.js`
