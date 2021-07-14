import React from "react";
import RenJS from "@renproject/ren";
import { Bitcoin, Ethereum } from "@renproject/chains";
import Web3 from "web3";
import "./App.css";

import ABI from "./ABI.json";

// Replace with your contract's address.
const contractAddress = "0xb9b0442DE9BC214a23B434Ee2Ec7AF8A4e1b3eeE";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      balance: 0,
      message: "",
      error: "",
      renJS: new RenJS("testnet"),
    };
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
  };

  render = () => {
    const { balance, message, error } = this.state;
    return (
      <div className="App">
        <p>Balance: {balance} BTC</p>
        <p>
          <button onClick={() => this.deposit().catch(this.logError)}>
            Deposit 0.003 BTC
          </button>
        </p>
        <p>
          <button onClick={() => this.withdraw().catch(this.logError)}>
            Withdraw {balance} BTC
          </button>
        </p>
        {message.split("\n").map((line) => (
          <p>{line}</p>
        ))}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
      </div>
    );
  };

  updateBalance = async () => {
    const { web3 } = this.state;
    const contract = new web3.eth.Contract(ABI, contractAddress);
    const balance = await contract.methods.balance().call();
    this.setState({ balance: parseInt(balance.toString()) / 10 ** 8 });
  };

  logError = (error) => {
    console.error(error);
    this.setState({ error: String((error || {}).message || error) });
  };

  log = (message) => {
    this.setState({ message });
  };

  deposit = async () => {
    this.logError(""); // Reset error

    const { web3, renJS } = this.state;

    const amount = 0.003; // BTC
    const mint = await renJS.lockAndMint({
      // Send BTC from the Bitcoin blockchain to the Ethereum blockchain.
      asset: "BTC",
      from: Bitcoin(),
      to: Ethereum(web3.currentProvider).Contract({
        // The contract we want to interact with
        sendTo: contractAddress,

        // The name of the function we want to call
        contractFn: "deposit",

        // Arguments expected for calling `deposit`
        contractParams: [
          {
            name: "_msg",
            type: "bytes",
            value: Buffer.from(`Depositing ${amount} BTC`),
          },
        ],
      }),
    });

    // Show the gateway address to the user so that they can transfer their BTC to it.
    this.log(`Deposit ${amount} BTC to ${mint.gatewayAddress}`);

    mint.on("deposit", async (deposit) => {
      // Details of the deposit are available from `deposit.depositDetails`.

      const hash = deposit.txHash();
      const depositLog = (msg) =>
        this.log(
          `BTC deposit: ${Bitcoin.utils.transactionExplorerLink(
            deposit.depositDetails.transaction,
            "testnet"
          )}\n
          RenVM Hash: ${hash}\n
          Status: ${deposit.status}\n
          ${msg}`
        );

      await deposit
        .confirmed()
        .on("target", (target) => depositLog(`0/${target} confirmations`))
        .on("confirmation", (confs, target) =>
          depositLog(`${confs}/${target} confirmations`)
        );

      await deposit
        .signed()
        // Print RenVM status - "pending", "confirming" or "done".
        .on("status", (status) => depositLog(`Status: ${status}`));

      await deposit
        .mint()
        // Print Ethereum transaction hash.
        .on("transactionHash", (txHash) => depositLog(`Mint tx: ${txHash}`));

      this.log(`Deposited ${amount} BTC.`);
    });
  };

  withdraw = async () => {
    this.logError(""); // Reset error

    const { web3, renJS, balance } = this.state;

    const recipient = prompt("Enter BTC recipient:");
    const amount = balance;
    const burnAndRelease = await renJS.burnAndRelease({
      // Send BTC from Ethereum back to the Bitcoin blockchain.
      asset: "BTC",
      to: Bitcoin().Address(recipient),
      from: Ethereum(web3.currentProvider).Contract((btcAddress) => ({
        sendTo: contractAddress,

        contractFn: "withdraw",

        contractParams: [
          {
            type: "bytes",
            name: "_msg",
            value: Buffer.from(`Withdrawing ${amount} BTC`),
          },
          {
            type: "bytes",
            name: "_to",
            value: Buffer.from(btcAddress),
          },
          {
            type: "uint256",
            name: "_amount",
            value: RenJS.utils.toSmallestUnit(amount, 8),
          },
        ],
      })),
    });

    let confirmations = 0;
    await burnAndRelease
      .burn()
      // Ethereum transaction confirmations.
      .on("confirmation", (confs) => {
        confirmations = confs;
      })
      // Print Ethereum transaction hash.
      .on("transactionHash", (txHash) =>
        this.log(`Ethereum transaction: ${String(txHash)}\nSubmitting...`)
      );

    await burnAndRelease
      .release()
      // Print RenVM status - "pending", "confirming" or "done".
      .on("status", (status) =>
        status === "confirming"
          ? this.log(`${status} (${confirmations}/15)`)
          : this.log(status)
      )
      // Print RenVM transaction hash
      .on("txHash", this.log);

    this.log(`Withdrew ${amount} BTC to ${recipient}.`);
  };
}

export default App;
