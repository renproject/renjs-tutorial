import React from 'react';
import GatewayJS from "@renproject/gateway";
import Web3 from "web3";
import './App.css';

import ABI from "./ABI.json";

// Replace with your contract's address.
const contractAddress = "0x3aa969d343bd6ae66c4027bb61a382dc96e88150";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      balance: 0,
      message: "",
      error: "",
      gatewayJS: new GatewayJS("testnet"),
    }
  }

  componentDidMount = async () => {
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
        this.logError("Please allow access to your Web3 wallet.");
        return;
      }
    }
    // Legacy dApp browsers...
    else if (window.web3) {
      web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
      this.logError("Please install MetaMask!");
      return;
    }

    const web3 = new Web3(web3Provider);

    const networkID = await web3.eth.net.getId();
    if (networkID !== 42) {
      this.logError("Please set your network to Kovan.");
      return;
    }

    this.setState({ web3 }, () => {

      // Update balances immediately and every 10 seconds
      this.updateBalance();
      setInterval(() => {
        this.updateBalance();
      }, 10 * 1000);
    });

    this.recoverTransfers().catch(this.logError);
  }

  render = () => {
    const { balance, message, error } = this.state;
    return (
      <div className="App">
        <p>Balance: {balance} BTC</p>
        <p><button onClick={() => this.deposit().catch(this.logError)}>Deposit 0.001 BTC</button></p>
        <p><button onClick={() => this.withdraw().catch(this.logError)}>Withdraw {balance} BTC</button></p>
        <p>{message}</p>
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
      </div>
    );
  }

  updateBalance = async () => {
    const { web3 } = this.state;
    const contract = new web3.eth.Contract(ABI, contractAddress);
    const balance = await contract.methods.balance().call();
    this.setState({ balance: parseInt(balance.toString()) / 10 ** 8 });
  }

  logError = (error) => {
    console.error(error);
    this.setState({ error: String((error || {}).message || error) });
  }

  log = (message) => {
    this.setState({ message });
  }

  deposit = async () => {
    const { web3, gatewayJS } = this.state;
    const amount = 0.001; // BTC

    try {
      await gatewayJS.open({
        // Send BTC from the Bitcoin blockchain to the Ethereum blockchain.
        sendToken: GatewayJS.Tokens.BTC.Btc2Eth,

        // Amount of BTC we are sending (in Satoshis)
        suggestedAmount: Math.floor(amount * (10 ** 8)), // Convert to Satoshis

        // The contract we want to interact with
        sendTo: contractAddress,

        // The name of the function we want to call
        contractFn: "deposit",

        // The nonce is used to guarantee a unique deposit address
        nonce: GatewayJS.utils.randomNonce(),

        // Arguments expected for calling `deposit`
        contractParams: [
          {
            name: "_msg",
            type: "bytes",
            value: web3.utils.fromAscii(`Depositing ${amount} BTC`),
          }
        ],

        // Web3 provider for submitting mint to Ethereum
        web3Provider: web3.currentProvider,
      }).result();
      this.log(`Deposited ${amount} BTC.`);
    } catch (error) {
      // Handle error
      this.logError(error);
    }
  }

  withdraw = async () => {
    const { web3, gatewayJS, balance } = this.state;

    const amount = balance;
    const recipient = prompt("Enter BTC recipient:");

    // You can surround shiftOut with a try/catch to handle errors.

    await gatewayJS.open({
      // Send BTC from the Ethereum blockchain to the Bitcoin blockchain.
      // This is the reverse of shitIn.
      sendToken: GatewayJS.Tokens.BTC.Eth2Btc,

      // The contract we want to interact with
      sendTo: contractAddress,

      // The name of the function we want to call
      contractFn: "withdraw",

      // Arguments expected for calling `deposit`
      contractParams: [
        { name: "_msg", type: "bytes", value: web3.utils.fromAscii(`Withdrawing ${amount} BTC`) },
        { name: "_to", type: "bytes", value: "0x" + Buffer.from(recipient).toString("hex") },
        { name: "_amount", type: "uint256", value: Math.floor(amount * (10 ** 8)) },
      ],

      // Web3 provider for submitting burn to Ethereum
      web3Provider: web3.currentProvider,
    }).result();

    this.log(`Withdrew ${amount} BTC to ${recipient}.`);
  }

  recoverTransfers = async () => {
    const { web3, gatewayJS } = this.state;
    // Load previous transfers from local storage
    const previousGateways = await gatewayJS.getGateways();
    // Resume each transfer
    for (const transfer of Array.from(previousGateways.values())) {
      gatewayJS
        .recoverTransfer(web3.currentProvider, transfer)
        .pause()
        .result()
        .catch(this.logError);
    }
  }
}

export default App;