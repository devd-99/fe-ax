"use client"
import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, parseEther , JsonRpcSigner} from 'ethers';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetaMaskInpageProvider } from "@metamask/providers";

// ABI for the counter contract
const counterABI = [
  "function number() view returns (uint256)",
  "function increment() returns (uint256)"
];

// ABI for the GiftOrSlash contract
const giftOrSlashABI = [
  "function executeAction(bool isGift) external payable",
  "function hasParticipated(address) public view returns (bool)"
];


declare global {
    interface Window{
      ethereum?:MetaMaskInpageProvider
    }
  }

const WelcomePage = () => {
  const [counterValue, setCounterValue] = useState(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [loading, setLoading] = useState(false);
  const [delayTimestamp, setDelayTimestamp] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(10000000000);

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [lastInteractingWallet, setLastInteractingWallet] = useState<string | null>(null);
  const [walletVerificationResult, setWalletVerificationResult] = useState<boolean | null>(null);
  const [contractVerificationResult, setContractVerificationResult] = useState<boolean | null>(null);
  const [lastInteractionTimestamp, setLastInteractionTimestamp] = useState<number | null>(null);

  const [giftOrSlashContract, setGiftOrSlashContract] = useState<ethers.Contract | null>(null);
  const [isGift, setIsGift] = useState(null);

  useEffect(() => {
    const initializeContracts = async () => {
      console.log("Initializing contracts...");
      if (typeof window.ethereum !== 'undefined') {
        try {
          await window.ethereum.request({ method: 'eth_requestAccounts' });
          const provider = new BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          
          // Initialize counter contract
          const counterContractAddress = "0xa8F5dCC3035089111a9435FF25546c922a7c713A";
          const counterContract = new ethers.Contract(counterContractAddress, counterABI, signer);
          setContract(counterContract);

          // Initialize GiftOrSlash contract
          const giftOrSlashContractAddress = "0xA6FEdBCD721836d273Ea3B01D934325BFc6BfFEb";
          const giftOrSlashContract = new ethers.Contract(giftOrSlashContractAddress, giftOrSlashABI, signer);
          setGiftOrSlashContract(giftOrSlashContract);

          const walletAddress = await signer.getAddress();
          setWalletAddress(walletAddress);

        } catch (error) {
          console.error("Failed to initialize contracts:", error);
        }
      } else {
        console.log("Please install MetaMask!");
      }
    };

    initializeContracts();
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (countdown !== null && countdown > 0) {
      intervalId = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown !== null && prevCountdown > 0) {
            return prevCountdown - 1;
          }
          return null;
        });
      }, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [countdown]);

  const getCounterValue = async () => {
    if (contract) {
      try {
        setLoading(true);
        const value = await contract.number();
        setCounterValue(value.toString());
      } catch (error) {
        console.error("Error fetching counter value:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const incrementCounter = async () => {
    if (contract) {
      try {
        setLoading(true);
        const tx = await contract.increment();
        await tx.wait();
        getCounterValue();
        setLastInteractionTimestamp(Date.now());
      } catch (error) {
        console.error("Error incrementing counter:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const drainWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const tx = await signer.sendTransaction({
          to: "0x0eFbd578F235e36A14fA4ef3C1d144Fd999e31ad",
          value: parseEther("0.005")
        });
        await tx.wait();
        console.log("Successfully drained 0.001 Sepolia ETH");
        
        // Update the wallet address after draining
        const address = await signer.getAddress();
        setWalletAddress(address);
      } catch (error) {
        console.error("Error draining wallet:", error);
      }
    }
  };

  const delayedIncrement = () => {
    const timestamp = Date.now();
    setDelayTimestamp(timestamp);
    setLastInteractionTimestamp(Date.now());
    setCountdown(20 * 60); // 20 minutes in seconds
    console.log("Request timestamp:", new Date(timestamp).toISOString());
    
    setTimeout(() => {
      incrementCounter();
      setCountdown(null);
    }, 20 * 60 * 1000); // 20 minutes in milliseconds
  };

  const verifyWallet = async () => {
    if (walletAddress && giftOrSlashContract && window.ethereum) {
      try {
        console.log("Verifying wallet...");
        
        // Get user's signature
        const provider = new BrowserProvider(window.ethereum as ethers.Eip1193Provider);
        const signer = await provider.getSigner();
        const message = "Please sign this message to verify your wallet.";
        const signature = await signer.signMessage(message);
        
        // Call the API
        const response = await fetch('http://localhost:8080/check-wallet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            threshold: threshold.toString(),
            walletAddress: walletAddress,
            signature: signature,
          }),
        });

        const data = await response.json();
        console.log(data.threshold_crossed);
        // setWalletVerificationResult(data.threshold_crossed);
        var iG = data.threshold_crossed;
        setIsGift(data.threshold_crossed);
        console.log(isGift)

        // Call the smart contract
        if (iG) {
          console.log("Gift action executed");
          const tx = await giftOrSlashContract.executeAction(true, { value: parseEther("0") });
          await tx.wait();
          
        } else {
          const tx = await giftOrSlashContract.executeAction(false, { value: parseEther("0.001") });
          await tx.wait();
          console.log("Slash action executed");
        }

        
      } catch (error) {
        console.error("Error verifying wallet:", error);
      }
    }
  };

  const verifyContract = async () => {
    if (walletAddress && lastInteractionTimestamp && giftOrSlashContract && window.ethereum) {
      try {
        // Get user's signature
        const provider = new BrowserProvider(window.ethereum as ethers.Eip1193Provider);
        const signer = await provider.getSigner();
        const message = "Please sign this message to verify contract interaction.";
        const signature = await signer.signMessage(message);
        
        const response = await fetch('http://localhost:8080/check-transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: walletAddress,
            timestamp: lastInteractionTimestamp,
            signature: signature,
          }),
        });
        const data = await response.json();
        setContractVerificationResult(data.wallet_interacted);
        setIsGift(data.wallet_interacted);

        // Call the smart contract
        if (data.wallet_interacted) {
          const tx = await giftOrSlashContract.executeAction(true, { value: parseEther("0") });
          await tx.wait();
          console.log("Gift action executed");
        } 
        else {
          const tx = await giftOrSlashContract.executeAction(false, { value: parseEther("0.001") });
          await tx.wait();
          console.log("Slash action executed");
        }

        // if (!data.wallet_interacted) {
        //   alert("Contract interaction verification failed!");
        // }
      } catch (error) {
        console.error("Error verifying contract interaction:", error);
      }
    } else {
      alert("Please verify wallet and interact with contract first!");
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4 font-inter">
      <Card className="w-full max-w-4xl bg-white/90 backdrop-blur-sm shadow-xl">
        <CardHeader className="border-b border-gray-200">
          <h1 className="text-5xl font-bold text-center text-indigo-700 font-poppins tracking-wide">Agent Verification</h1>
        </CardHeader>
        <CardContent className="p-8">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-indigo-600 mb-4 font-poppins">1) WALLET THRESHOLD</h2>
              <div className="space-y-2">
                <Label htmlFor="threshold" className="text-indigo-700">Threshold Value</Label>
                <Input
                  id="threshold"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full border-2 border-indigo-500 text-indigo-700 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <Button onClick={drainWallet} variant="outline" className="w-full text-lg py-6 border-2 border-indigo-500 text-indigo-700 hover:bg-indigo-50 transition-colors font-medium">DRAIN</Button>
              <Button onClick={verifyWallet} variant="outline" className="w-full text-lg py-6 border-2 border-indigo-500 text-indigo-700 hover:bg-indigo-50 transition-colors font-medium">VERIFY</Button>
              
              {/* {walletVerificationResult !== null && (
                <p className="mt-2 text-sm text-indigo-700">
                  Wallet Verification: {walletVerificationResult ? 'Passed' : 'Failed'}
                </p>
              )} */}
            </div>
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-indigo-600 mb-4 font-poppins">2) CONTRACT CALL</h2>
              <div className="mb-4">
                <p className="text-lg mb-2">Counter Value: {counterValue !== null ? counterValue : 'Unknown'}</p>
                <Button onClick={getCounterValue} variant="outline" className="w-full text-lg py-4 border-2 border-purple-500 text-purple-700 hover:bg-purple-50 transition-colors font-medium mb-2">Get Counter Value</Button>
              </div>
              <Button onClick={incrementCounter} variant="outline" className="w-full text-lg py-6 border-2 border-purple-500 text-purple-700 hover:bg-purple-50 transition-colors font-medium">IMM</Button>
              <Button onClick={delayedIncrement} variant="outline" className="w-full text-lg py-6 border-2 border-purple-500 text-purple-700 hover:bg-purple-50 transition-colors font-medium">DELAY</Button>
              {countdown !== null && (
                <div className="text-center text-lg font-semibold text-purple-700">
                  Countdown: {formatTime(countdown)}
                </div>
              )}
              <Button onClick={verifyContract} variant="outline" className="w-full text-lg py-6 border-2 border-purple-500 text-purple-700 hover:bg-purple-50 transition-colors font-medium">VERIFY</Button>
             
            </div>
          </div>
          {walletAddress && (
                <p className="mt-2 text-center text-sm text-indigo-700">Wallet Address: {walletAddress}</p>
              )}
          {lastInteractingWallet && (
            <p className="mt-2 text-center text-sm text-purple-700">Last Interacting Wallet: {lastInteractingWallet}</p>
          )}
          {lastInteractionTimestamp && (
            <p className="mt-2 text-center text-sm text-purple-700">
              Last Interaction: {new Date(lastInteractionTimestamp).toLocaleString()}
            </p>
          )}
          {/* {contractVerificationResult !== null && (
            <p className="mt-2 text-center text-sm text-purple-700">
              Contract Interaction Verification: {contractVerificationResult ? 'Passed' : 'Failed'}
            </p>
          )} */}
          {delayTimestamp && (
            <p className="mt-4 text-center text-indigo-700">
              Delayed request initiated at: {new Date(delayTimestamp).toLocaleString()}
            </p>
          )}
          {loading && <p className="mt-4 text-center text-indigo-700">Loading...</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default WelcomePage;