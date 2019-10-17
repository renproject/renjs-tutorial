// @ts-nocheck

import React from 'react';
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
      error: "",
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

  render = () => {
    const { balance, message, error } = this.state;
    return (
      <div className="App">
        <p>Balance: {balance} BTC</p>
        <p><button onClick={this.deposit}>Deposit 0.001 BTC</button></p>
        <p><button onClick={() => this.withdraw().catch(this.logError)}>Withdraw {balance} BTC</button></p>
        <p>{message}</p>
        {error ? <p color="red">{error}</p> : null}
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
    this.setState({ error: String((error || {}).message || error) });
  }

  log = (message) => {
    this.setState({ message });
  }

  deposit = async () => {
    // TODO
  }

  withdraw = async () => {
    this.logError("");
    // TODO
  }
}

export default App;
