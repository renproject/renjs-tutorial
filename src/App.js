// @ts-nocheck

import React from 'react';
import RenJS from "@renproject/ren";
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
      renJS: new RenJS("testnet"),
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

    // Check if the user has an incomplete trade
    const currentTrade = this.getTrade();

    // Check if the trade is a deposit or a withdrawal
    if (currentTrade && currentTrade.sendToken === RenJS.Tokens.BTC.Btc2Eth) {
      this.deposit(currentTrade);
    }
    if (currentTrade && currentTrade.sendToken === RenJS.Tokens.BTC.Eth2Btc) {
      this.withdraw(currentTrade);
    }
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
    if (error) {
      console.error(error);
    }
    this.setState({ error: String((error || {}).message || error) });
  }

  log = (message) => {
    this.setState({ message });
  }

  // Store a trade's details to local storage
  storeTrade = (trade) => {
    localStorage.setItem("trade", JSON.stringify(trade));
  }

  // Retrieve a trade's details from local storage, if there is one
  getTrade = () => {
    try {
      return JSON.parse(localStorage.getItem("trade"));
    } catch (error) {
      return undefined;
    }
  }

  deposit = async (trade) => {
    this.logError(""); // Reset error

    const { web3, renJS } = this.state;

    const amount = 0.001; // BTC

    trade = trade || {
      // Send BTC from the Bitcoin blockchain to the Ethereum blockchain.
      sendToken: RenJS.Tokens.BTC.Btc2Eth,

      // Amount of BTC we are sending (in Satoshis)
      sendAmount: Math.floor(amount * (10 ** 8)), // Convert to Satoshis

      // The contract we want to interact with
      sendTo: contractAddress,

      // The name of the function we want to call
      contractFn: "deposit",

      nonce: renJS.utils.randomNonce(),

      // Arguments expected for calling `deposit`
      contractParams: [
        {
          name: "_msg",
          type: "bytes",
          value: web3.utils.fromAscii(`Depositing ${amount} BTC`),
        }
      ],
    };

    this.storeTrade(trade);

    const shiftIn = renJS.shiftIn(trade);

    // Show the gateway address to the user so that they can transfer their BTC to it.
    const gatewayAddress = shiftIn.addr();
    this.log(`Deposit ${amount} BTC to ${gatewayAddress}`);

    // Wait for the Darknodes to detect the BTC transfer.
    const confirmations = 2;
    const deposit = await shiftIn.waitForDeposit(confirmations)
      .on("deposit", deposit => this.log(`Waiting for BTC confirmations: ${deposit.utxo.confirmations}/${confirmations}`));

    // Retrieve signature from RenVM.
    this.log("Submitting to RenVM...");
    const signature = await deposit.submitToRenVM()
      .on("status", status => this.log(`Submitting to RenVM... (${status})`));

    // Submit the signature to Ethereum and receive zBTC.
    this.log("Submitting to smart contract...");
    await signature.submitToEthereum(web3.currentProvider)
      .on("transactionHash", txHash => this.log(`Submitting to smart contract... (hash: ${txHash})`));
    this.log(`Deposited ${amount} BTC.`);

    // Clear trade from localstorage
    this.storeTrade(undefined);
  }

  withdraw = async (trade) => {
    this.logError(""); // Reset error

    const { web3, renJS, balance } = this.state;

    if (!trade) {
      const amount = balance;
      const recipient = prompt("Enter BTC recipient:");
      const from = (await web3.eth.getAccounts())[0];
      const contract = new web3.eth.Contract(ABI, contractAddress);

      this.log("Calling `withdraw` on smart contract...");
      const txHash = await new Promise((resolve, reject) => {
        contract.methods.withdraw(
          web3.utils.fromAscii(`Depositing ${amount} BTC`), // _msg
          RenJS.utils.btc.addressToHex(recipient), //_to
          Math.floor(amount * (10 ** 8)), // _amount in Satoshis
        ).send({ from })
          .on("transactionHash", resolve)
          .catch(reject);
      });

      trade = {
        // Send BTC from the Ethereum blockchain to the Bitcoin blockchain.
        // This is the reverse of shitIn.
        sendToken: RenJS.Tokens.BTC.Eth2Btc,

        // The transaction hash of our contract call
        txHash,
      };
      this.storeTrade(trade);
    }

    this.log(`Retrieving burn event from contract...`);
    const shiftOut = await renJS.shiftOut({ ...trade, web3Provider: web3.currentProvider }).readFromEthereum();

    this.log(`Submitting to RenVM...`);
    await shiftOut.submitToRenVM()
      .on("status", status => this.log(`Submitting to RenVM... (${status})`));

    this.log(`Withdrew BTC successfully.`);

    // Clear trade from localstorage
    this.storeTrade(undefined);
  }
}

export default App;
