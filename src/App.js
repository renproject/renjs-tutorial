// @ts-nocheck

import React from 'react';
import RenSDK from "@renproject/ren";
import Web3 from "web3";
import './App.css';

import ABI from "./ABI.json";

// Replace with your contract's address.
const contractAddress = "0xb2731C04610C10f2eB6A26ad14E607d44309FC10";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      balance: 0,
      message: "",
      sdk: new RenSDK("testnet"),
    }
  }

  async componentDidMount() {
    let web3Provider;

    // Initialize web3 (https://medium.com/coinmonks/web3-js-ethereum-javascript-api-72f7b22e2f0a)
    // Modern dApp browsers...
    if (window.ethereum) {
      web3Provider = window.ethereum;
      try {
        // Request account access
        await window.ethereum.enable();
      } catch (error) {
        // User denied account access...
        console.error("User denied account access")
      }
    }
    // Legacy dApp browsers...
    else if (window.web3) {
      web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
      this.log("Please install MetaMask!");
    }

    const web3 = new Web3(web3Provider);

    this.setState({ web3 }, () => {

      // Update balances immediately and every 10 seconds
      this.updateBalance();
      setInterval(() => {
        this.updateBalance();
      }, 10 * 1000);
    });
  }

  render() {
    const { balance, message } = this.state;
    return (
      <div className="App">
        <p>Balance: {balance} BTC</p>
        <p><button onClick={this.deposit}>Deposit 0.001 BTC</button></p>
        <p><button onClick={this.withdraw}>Withdraw {balance} BTC</button></p>
        <p>{message}</p>
      </div>
    );
  }

  updateBalance = async () => {
    const { web3 } = this.state;
    const contract = new web3.eth.Contract(ABI, contractAddress);
    const balance = await contract.methods.balance().call();
    this.setState({ balance: parseInt(balance.toString()) / 10 ** 8 });
  }

  log = (message) => {
    this.setState({ message });
  }

  deposit = async () => {
    const { web3, sdk } = this.state;
    const amount = 0.001; // BTC

    const shiftIn = sdk.shiftIn({
      // Send BTC from the Bitcoin blockchain to the Ethereum blockchain.
      sendToken: RenSDK.Tokens.BTC.Btc2Eth,

      // Amount of BTC we are sending (in Satoshis)
      sendAmount: amount * (10 ** 8), // Convert to Satoshis

      // The contract we want to interact with
      sendTo: contractAddress,

      // The name of the function we want to call
      contractFn: "deposit",

      // Arguments expected for calling `deposit`
      contractParams: [
        {
          name: "_msg",
          type: "bytes",
          value: web3.utils.fromAscii(`Depositing ${amount} BTC`),
        }
      ],
    });

    // Show the gateway address to the user so that they can transfer their BTC to it.
    const gatewayAddress = shiftIn.addr();
    this.log(`Deposit ${amount} BTC to ${gatewayAddress}`);

    // Wait for the Darknodes to detect the BTC transfer.
    const confirmations = 0;
    const deposit = await shiftIn.waitForDeposit(confirmations);

    // Retrieve signature from RenVM.
    this.log("Submitting to RenVM...");
    const signature = await deposit.submitToRenVM();

    // Submit the signature to Ethereum and receive zBTC.
    this.log("Submitting to smart contract...");
    await signature.submitToEthereum(web3.currentProvider);
    this.log(`Deposited ${amount} BTC.`);
  }

  withdraw = async () => {
    const { web3, sdk, balance } = this.state;

    const amount = balance;
    const recipient = prompt("Enter BTC recipient:");
    const from = (await web3.eth.getAccounts())[0];
    const contract = new web3.eth.Contract(ABI, contractAddress);

    this.log("Calling `withdraw` on smart contract...");
    const txHash = await new Promise((resolve, reject) => {
      contract.methods.withdraw(
        web3.utils.fromAscii(`Depositing ${amount} BTC`), // _msg
        RenSDK.Tokens.BTC.addressToHex(recipient), //_to
        amount * (10 ** 8), // _amount in Satoshis
      ).send({ from })
        .on("transactionHash", resolve)
        .catch(reject);
    });

    this.log(`Retrieving burn event from contract...`);
    const shiftOut = await sdk.shiftOut({
      // Send BTC from the Ethereum blockchain to the Bitcoin blockchain.
      // This is the reverse of shitIn.
      sendToken: RenSDK.Tokens.BTC.Eth2Btc,

      // The web3 provider to talk to Ethereum
      web3Provider: web3.currentProvider,

      // The transaction hash of our contract call
      txHash,
    }).readFromEthereum();

    this.log(`Submitting to Darknodes...`);
    await shiftOut.submitToRenVM();
    this.log(`Withdrew ${amount} BTC to ${recipient}.`);
  }
}

export default App;
