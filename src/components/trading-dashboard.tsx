
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  ArrowRightLeft,
  Info,
  Landmark,
  Loader2,
  LogOut,
  Monitor,
  Plane,
  Smartphone,
  ThumbsUp,
  User,
  Zap,
  Rocket,
  HandCoins,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useViewport } from "@/context/viewport-context";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { get, ref, update } from "firebase/database";
import { PriceChart } from "./price-chart";
import { UserModal } from "./user-modal";
import { Separator } from "./ui/separator";
import { GoldFlyAnimation } from "./goldfly-animation";
import { BitCrashAnimation } from "./bit-crash-animation";

const formSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Please enter a valid number." })
    .positive({ message: "Amount must be positive." })
    .optional(),
});

type TradeFormValues = z.infer<typeof formSchema>;

const INITIAL_PRICE = 65000;
const PRICE_HISTORY_LENGTH = 400;
const CANDLESTICK_INTERVAL = 5;
const EXTREME_MODE_THRESHOLD = 1_000_000;
const GOLDFLY_LOCKOUT_THRESHOLD = 10_000_000;
const BITCRASH_LOCKOUT_THRESHOLD = 25_000_000;
const GOLDFLY_PAYOUT_RATE = 1.4; // 1.4x payout

interface PriceData {
  time: string;
  price: number;
  ohlc?: [number, number, number, number];
}

type PriceRegimeKey = "LOW" | "MID" | "HIGH";
type TrendKey = "UP" | "DOWN" | "SIDEWAYS";
type TradeMode = "normal" | "goldfly" | 'bitcrash';

type PriceRegime = {
  name: string;
  range: [number, number];
  leaveProb: number;
  next: PriceRegimeKey | [PriceRegimeKey, PriceRegimeKey];
};

const priceRegimes: Record<PriceRegimeKey, PriceRegime> = {
  LOW: {
      name: "Bearish Market",
      range: [35000, 61000],
      leaveProb: 0.1, 
      next: "MID",
  },
  MID: {
      name: "Market Consolidation",
      range: [61000, 75000],
      leaveProb: 0.005, // 0.5% chance to leave
      next: ["LOW", "HIGH"],
  },
  HIGH: {
      name: "Bull Run",
      range: [75000, 120000],
      leaveProb: 0.1, 
      next: "MID",
  },
};

interface UserData {
  usdBalance: number;
  btcBalance: number;
  avgBtcCost: number;
  todaysPL: number;
  lastPrice?: number;
}

function calculateTrade(
  tradeType: "buy" | "sell",
  amountInUsd: number,
  price: number,
  currentUserData: Omit<UserData, 'todaysPL'>
) {
  const { usdBalance, btcBalance, avgBtcCost } =
    currentUserData;
  let result = {
    ...currentUserData,
    tradePL: 0,
    btcAmountTraded: 0,
    saleProceeds: 0,
  };

  if (tradeType === "buy") {
    const btcAmount = amountInUsd / price;
    const costOfNewBtc = amountInUsd;
    const totalCostOfExistingBtc = btcBalance * avgBtcCost;
    const newTotalBtc = btcBalance + btcAmount;
    const newTotalCost = totalCostOfExistingBtc + costOfNewBtc;

    result.usdBalance -= costOfNewBtc;
    result.btcBalance = newTotalBtc;
    result.avgBtcCost = newTotalBtc > 0 ? newTotalCost / newTotalBtc : 0;
    result.btcAmountTraded = btcAmount;
  } else {
    // sell
    const btcToSell = amountInUsd / price;
    const proceedsFromSale = btcToSell * price;
    const costOfBtcSold = btcToSell * avgBtcCost;
    const tradePL = proceedsFromSale - costOfBtcSold;

    result.btcBalance -= btcToSell;
    result.usdBalance += proceedsFromSale; 
    result.avgBtcCost = result.btcBalance < 0.00000001 ? 0 : avgBtcCost;
    result.tradePL = tradePL;
    result.btcAmountTraded = btcToSell;
    result.saleProceeds = proceedsFromSale;
  }
  return result;
}

export default function TradingDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrading, setIsTrading] = useState(false);
  
  const [usdBalance, setUsdBalance] = useState<number>(1000);
  const [todaysPL, setTodaysPL] = useState<number>(0);

  const btcBalanceRef = useRef<number>(0); 
  const [btcBalance, _setBtcBalance] = useState<number>(0);
  const avgBtcCostRef = useRef<number>(0);
  const [avgBtcCost, _setAvgBtcCost] = useState<number>(0);
  
  const setBtcBalance = (value: number) => {
    btcBalanceRef.current = value;
    _setBtcBalance(value);
  }
  const setAvgBtcCost = (value: number) => {
    avgBtcCostRef.current = value;
    _setAvgBtcCost(value);
  }

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: undefined,
    },
  });

  const [isExtremeMode, setIsExtremeMode] = useState(false);

  const [currentPrice, setCurrentPrice] = useState(INITIAL_PRICE);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const rawPriceHistoryRef = useRef<PriceData[]>([]);
  const [chartType, setChartType] = useState<"area" | "candlestick">("area");

  const [priceRegime, setPriceRegime] = useState<PriceRegimeKey>("MID");
  const [trend, setTrend] = useState<TrendKey>("SIDEWAYS");
  const trendUpdatesLeft = useRef(0);
  const [tradeMode, setTradeMode] = useState<TradeMode>("normal");
  
  // GoldFly State
  const [goldFlyState, setGoldFlyState] = useState<'idle' | 'running' | 'finished'>('idle');
  const [goldFlyBet, setGoldFlyBet] = useState<{direction: 'up' | 'down', amount: number} | null>(null);
  const [goldFlyAltitude, setGoldFlyAltitude] = useState(0);
  const planeRef = useRef<HTMLDivElement>(null);
  const [finalAltitude, setFinalAltitude] = useState<number | null>(null);

  // BitCrash State
  const [bitCrashState, setBitCrashState] = useState<'idle' | 'running' | 'blasted' | 'withdrawn'>('idle');
  const [gainPercent, setGainPercent] = useState(0);
  const [isTurboRound, setIsTurboRound] = useState(false);
  const [blastToast, setBlastToast] = useState(false);
  const bitCrashIntervalRef = useRef<NodeJS.Timeout | null>(null);


  const { toast } = useToast();
  const { isMobile } = useViewport();

  const priceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const regimeRef = useRef(priceRegime);
  const trendRef = useRef(trend);

  useEffect(() => {
    regimeRef.current = priceRegime;
  }, [priceRegime]);
   useEffect(() => {
    trendRef.current = trend;
  }, [trend]);

  const handleUserLogin = useCallback(
    async (name: string): Promise<"success" | "not_found" | "error"> => {
      try {
        const userRef = ref(db, `users/${name}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const userData: UserData = snapshot.val();
          setUsdBalance(userData.usdBalance ?? 1000);
          setBtcBalance(userData.btcBalance ?? 0);
          setAvgBtcCost(userData.avgBtcCost ?? 0);
          setTodaysPL(userData.todaysPL ?? 0);

          const lastPrice = userData.lastPrice ?? INITIAL_PRICE;
          
          let initialRegime: PriceRegimeKey = "MID";
          if (lastPrice < priceRegimes.LOW.range[1]) {
            initialRegime = "LOW";
          } else if (lastPrice > priceRegimes.HIGH.range[0]) {
            initialRegime = "HIGH";
          }
          
          setCurrentPrice(lastPrice);
          setPriceRegime(initialRegime);

          setUsername(name);
          localStorage.setItem("bitsim_username", name);
          setIsModalOpen(false);
          return "success";
        } else {
          return "not_found";
        }
      } catch (err) {
        console.error("Firebase error during login: ", err);
        toast({
          variant: "destructive",
          description: "Error connecting to the server.",
        });
        return "error";
      }
    },
    [toast]
  );

  useEffect(() => {
    const storedUsername = localStorage.getItem("bitsim_username");
    if (storedUsername) {
      handleUserLogin(storedUsername).finally(() => setIsLoading(false));
    } else {
      setIsModalOpen(true);
      setIsLoading(false);
    }
  }, [handleUserLogin]);

  useEffect(() => {
    if (!username || isLoading || tradeMode !== 'normal') return;
  
    const updatePrice = () => {
      setCurrentPrice((prevPrice) => {
        let currentRegimeKey = regimeRef.current;
        const currentRegime = priceRegimes[currentRegimeKey];
        
        // --- Regime Transition Logic ---
        if (Math.random() < currentRegime.leaveProb) {
            const nextRegime = currentRegime.next;
            if (Array.isArray(nextRegime)) {
                // If in MID, low chance to move
                if (currentRegimeKey === 'MID') {
                   const rand = Math.random();
                   if (rand < 0.1) currentRegimeKey = 'LOW'; // 10% chance to go low
                   else if (rand < 0.2) currentRegimeKey = 'HIGH'; // 10% chance to go high
                   // 80% chance to stay MID
                } else {
                    currentRegimeKey = Math.random() < 0.5 ? nextRegime[0] : nextRegime[1];
                }
            } else {
                currentRegimeKey = nextRegime;
            }
        }
        if (currentRegimeKey !== regimeRef.current) {
          setPriceRegime(currentRegimeKey);
          setTrend('SIDEWAYS'); // Reset trend on regime change
          trendUpdatesLeft.current = 0;
        }

        // --- Trend Logic for Mid-Range ---
        if(currentRegimeKey === 'MID') {
            if (trendUpdatesLeft.current <= 0) {
                // Time for a new trend
                const rand = Math.random();
                let newTrend: TrendKey;
                if (rand < 0.45) newTrend = 'UP';
                else if (rand < 0.9) newTrend = 'DOWN';
                else newTrend = 'SIDEWAYS';
                setTrend(newTrend);
                trendUpdatesLeft.current = 50 + Math.floor(Math.random() * 100); // Trend lasts for 50-150 updates
            } else {
                trendUpdatesLeft.current -= 1;
            }
        } else {
            setTrend('SIDEWAYS');
        }
        
        // --- Price Movement Logic ---
        let newPrice = prevPrice;
        let percentageChange = 0;
        const volatilityRand = Math.random();

        // Base volatility
        if (volatilityRand < 0.9) { // 90% chance for small change
            percentageChange = (Math.random() - 0.5) * 0.01; // -0.5% to +0.5%
        } else if (volatilityRand < 0.98) { // 8% chance for larger swing
            percentageChange = (Math.random() - 0.5) * 0.04; // -2% to +2%
        } else { // 2% chance for major swing - HEAVY MOVEMENT
            percentageChange = (Math.random() > 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.04); // +/- 4% to 8%
        }
        
        let changeAmount = prevPrice * percentageChange;
        
        // Add trend bias for heavy growth/decline
        if (regimeRef.current === 'MID') {
            const currentTrend = trendRef.current;
            if (currentTrend === 'UP') {
                changeAmount += prevPrice * 0.0015 * Math.random(); // Stronger upward bias
            } else if (currentTrend === 'DOWN') {
                changeAmount -= prevPrice * 0.0015 * Math.random(); // Stronger downward bias
            }
        }

        // Extreme difficulty: downward pressure against unrealized gains
        const unrealizedPL = (prevPrice - avgBtcCostRef.current) * btcBalanceRef.current;
        if (unrealizedPL > 0 && btcBalanceRef.current > 0) {
            const difficultyFactor = 0.1; // Extremely difficult
            const pull = Math.log1p(unrealizedPL) * difficultyFactor;
            changeAmount -= prevPrice * (pull / 1000) * Math.random();
        }
        
        newPrice += changeAmount;

        // Boundary checks to nudge price back into its regime
        const [minRange, maxRange] = priceRegimes[currentRegimeKey].range;
        if (newPrice < minRange) {
          const pullStrength = Math.min(0.5, (minRange - newPrice) / minRange);
          newPrice += (minRange - newPrice) * pullStrength;
        } else if (newPrice > maxRange) {
          const pullStrength = Math.min(0.5, (newPrice - maxRange) / maxRange);
          newPrice -= (newPrice - maxRange) * pullStrength;
        }

        // Absolute floor
        return Math.max(priceRegimes.LOW.range[0] * 0.9, newPrice);
      });
  
      const nextUpdateIn = 1000 + Math.random() * 500;
  
      if (priceUpdateTimeoutRef.current) {
        clearTimeout(priceUpdateTimeoutRef.current);
      }
      priceUpdateTimeoutRef.current = setTimeout(updatePrice, nextUpdateIn);
    };
  
    updatePrice();
  
    return () => {
      if (priceUpdateTimeoutRef.current)
        clearTimeout(priceUpdateTimeoutRef.current);
    };
  }, [username, isLoading, tradeMode]);

  const portfolioValue = usdBalance + btcBalance * currentPrice;
  const isGoldFlyLocked = usdBalance > GOLDFLY_LOCKOUT_THRESHOLD;
  const isBitCrashLocked = usdBalance > BITCRASH_LOCKOUT_THRESHOLD;


  // Altitude tracker for GoldFly
  useEffect(() => {
    if (goldFlyState !== 'running') return;

    const interval = setInterval(() => {
        if (planeRef.current) {
            const container = planeRef.current.parentElement;
            if (!container) return;

            const planeRect = planeRef.current.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            const planeCenterY = planeRect.top - containerRect.top + planeRect.height / 2;
            const containerHeight = container.clientHeight;

            // Invert so higher on screen is higher altitude and ensure it's not negative
            const newAltitude = 100 - (planeCenterY / containerHeight * 100);
            setGoldFlyAltitude(Math.max(0, newAltitude));
        }
    }, 50);

    return () => clearInterval(interval);
  }, [goldFlyState]);

   const handleGoldFlyAnimationComplete = useCallback((altitude: number) => {
    setFinalAltitude(Math.max(0, altitude));
  }, []);
  
  useEffect(() => {
    if (finalAltitude === null || !username || !goldFlyBet) return;
    
    const betLineAltitude = 50;
    const { direction, amount: betAmount } = goldFlyBet;
    
    const isWin = (direction === 'up' && finalAltitude > betLineAltitude) || 
                  (direction === 'down' && finalAltitude < betLineAltitude);

    let finalUsdBalance;
    if (isWin) {
      const winnings = betAmount * GOLDFLY_PAYOUT_RATE;
      finalUsdBalance = usdBalance + winnings; // The bet amount was already deducted, so we add the full payout
      toast({
        title: "You Won! 🎉",
        description: `Your profit is $${(winnings - betAmount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      });
    } else {
      finalUsdBalance = usdBalance; // Bet amount was already deducted
      toast({
        title: "You Lost ❌",
        description: `You lost $${betAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        variant: 'destructive'
      });
    }

    const userRef = ref(db, `users/${username}`);
    update(userRef, { usdBalance: finalUsdBalance });
    setUsdBalance(finalUsdBalance);

    setGoldFlyState('finished');
    setIsTrading(false);
    form.reset({ amount: goldFlyBet.amount });
    setFinalAltitude(null);

  }, [finalAltitude, username, goldFlyBet, usdBalance, toast, form]);


  useEffect(() => {
    const mode = portfolioValue >= EXTREME_MODE_THRESHOLD;
    if (mode !== isExtremeMode) {
      setIsExtremeMode(mode);
      if (tradeMode === 'normal') {
          toast({
            title: mode ? "Extreme Mode Activated!" : "Normal Mode Restored",
            description: mode
              ? "Your portfolio is over $1M. Trading rules have changed."
              : "Your portfolio is below $1M. Standard trading rules apply.",
            variant: mode ? "destructive" : "default",
          });
      }
    }
  }, [portfolioValue, isExtremeMode, toast, tradeMode]);

  useEffect(() => {
    if (!username || tradeMode !== 'normal') return;

    const newTime = new Date();
    const newEntry: PriceData = {
      time: newTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      price: currentPrice,
    };

    rawPriceHistoryRef.current = [
      ...rawPriceHistoryRef.current,
      newEntry,
    ].slice(-PRICE_HISTORY_LENGTH * CANDLESTICK_INTERVAL);

    if (chartType === "candlestick") {
      const tempHistory = rawPriceHistoryRef.current;
      const candles = [];
      let i = 0;
      while (i < tempHistory.length) {
        const chunk = tempHistory.slice(i, i + CANDLESTICK_INTERVAL);
        if (chunk.length > 0) {
          const open = chunk[0].price;
          const close = chunk[chunk.length - 1].price;
          const high = Math.max(...chunk.map((p) => p.price));
          const low = Math.min(...chunk.map((p) => p.price));
          const candleTime = chunk[0].time;

          candles.push({
            time: candleTime.substring(0, 5),
            price: close,
            ohlc: [open, high, low, close] as [number, number, number, number],
          });
        }
        i += CANDLESTICK_INTERVAL;
      }
      setPriceHistory(candles.slice(-PRICE_HISTORY_LENGTH));
    } else {
      const currentHistory = rawPriceHistoryRef.current.map((d) => ({
        ...d,
        time: d.time.substring(0, 5),
      }));
      setPriceHistory(currentHistory.slice(-PRICE_HISTORY_LENGTH));
    }

    const savePrice = async () => {
      if (username) {
        const userRef = ref(db, `users/${username}`);
        await update(userRef, { lastPrice: currentPrice });
      }
    };
    const timeoutId = setTimeout(savePrice, 1000); 
    return () => clearTimeout(timeoutId);
  }, [currentPrice, chartType, username, tradeMode]);

  useEffect(() => {
    if (blastToast) {
        toast({
            title: "Blasted! 💥",
            description: "You lost your bet.",
            variant: "destructive"
        });
        setBlastToast(false);
    }
  }, [blastToast, toast]);

  const handleBitCrashBlast = useCallback(() => {
    if (bitCrashIntervalRef.current) {
        clearInterval(bitCrashIntervalRef.current);
        bitCrashIntervalRef.current = null;
    }
    setBitCrashState('blasted');
    setIsTrading(false);
    setIsTurboRound(false);
    setBlastToast(true);
  }, []);

  const handleLogout = async () => {
    if (username) {
      try {
        const userRef = ref(db, `users/${username}`);
        await update(userRef, { lastPrice: currentPrice, todaysPL });
      } catch (error) {
        console.error("Failed to save data on logout", error);
      }
    }
    setUsername(null);
    setUsdBalance(0);
    setBtcBalance(0);
    setAvgBtcCost(0);
    setTodaysPL(0);
    setPriceHistory([]);
    rawPriceHistoryRef.current = [];
    localStorage.removeItem("bitsim_username");
    setIsModalOpen(true);
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
  };

  const handleFeedback = () => {
    toast({
      title: "Feedback Submitted",
      description: "Thank you for your feedback!",
    });
  };
  
  const handleGoldFlyTrade = async(values: TradeFormValues, direction: 'up' | 'down') => {
    if (isTrading || !username || !values.amount) return;

    // If game is finished, reset to idle before starting a new one.
    if (goldFlyState === 'finished') {
        setGoldFlyState('idle');
        setGoldFlyBet(null);
        return; // Let user click again to start
    }

    const betAmount = values.amount;
    if (betAmount > usdBalance) {
        toast({ variant: 'destructive', description: "Insufficient USD to place this bet." });
        return;
    }
    
    setIsTrading(true);
    setGoldFlyBet({ direction, amount: betAmount });
    setGoldFlyState('running');
    
    // Deduct bet amount immediately
    setUsdBalance(prev => prev - betAmount);
  }

  const handleBitCrashFly = (values: TradeFormValues) => {
    if (isTrading || !username || !values.amount) return;

    if (bitCrashState === 'blasted' || bitCrashState === 'withdrawn') {
        setBitCrashState('idle');
        setGainPercent(0);
        return; // Let user click again to start
    }
    
    const betAmount = values.amount;
    if (betAmount > usdBalance) {
        toast({ variant: 'destructive', description: "Insufficient USD to place this bet." });
        return;
    }

    setIsTrading(true);
    
    // 3 second delay before starting
    setTimeout(() => {
        setUsdBalance(prev => prev - betAmount);
        setBitCrashState('running');
        setGainPercent(0);

        const isTurbo = Math.random() < 0.08;
        setIsTurboRound(isTurbo);
        if (isTurbo) {
          toast({
            title: "🚀 Turbo Round! 🚀",
            description: "The rocket is supercharged! Blast zone is between 80% and 90% gain.",
          });
        }

        bitCrashIntervalRef.current = setInterval(() => {
            setGainPercent(prevGain => {
                const newGain = prevGain + Math.random() * 0.5;
                
                let blastChance = 0;
                
                if (isTurbo) {
                    if (newGain > 80 && newGain < 90) {
                        blastChance = 0.25; // High chance to blast within the turbo zone
                    } else if (newGain >= 90) {
                        blastChance = 1; // Guaranteed blast after 90
                    }
                } else {
                    if (newGain < 15) blastChance = 0.035;
                    else if (newGain < 30) blastChance = 0.22;
                    else if (newGain < 70) blastChance = 0.43;
                    else if (newGain < 90) blastChance = 0.55;
                    else blastChance = 0.99;
                }

                if (Math.random() < blastChance / 20) { // Check every 50ms approx
                    handleBitCrashBlast();
                    return prevGain;
                }

                return newGain;
            });
        }, 50);
    }, 3000);
  };

  const handleBitCrashWithdraw = () => {
    if (bitCrashIntervalRef.current) clearInterval(bitCrashIntervalRef.current);
    if (!username) return;

    setBitCrashState('withdrawn');
    const betAmount = form.getValues('amount') || 0;
    const profit = betAmount * (gainPercent / 100);
    const newBalance = usdBalance + betAmount + profit;

    const userRef = ref(db, `users/${username}`);
    update(userRef, { usdBalance: newBalance });
    setUsdBalance(newBalance);
    
    toast({
        title: "Withdrawn! 💰",
        description: `You secured a profit of $${profit.toFixed(2)} at ${gainPercent.toFixed(2)}% gain.`
    });
    setIsTrading(false);
    setIsTurboRound(false);
  }

  const handleTrade = async (
    values: TradeFormValues,
    type: "buy" | "sell"
  ) => {
    if (isTrading || !username || !values.amount) return;

    const { amount: amountInUsd } = values;

    setIsTrading(true);

    if (isExtremeMode) {
      if (type === "sell") {
        toast({
          variant: "destructive",
          description: "Sell option is disabled in Extreme Mode.",
        });
        setIsTrading(false);
        return;
      }

      if (amountInUsd > usdBalance) {
        toast({
          variant: "destructive",
          description: "Insufficient USD to place this bet.",
        });
        setIsTrading(false);
        return;
      }

      try {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const isWin = Math.random() < 0.2;
        const payout = isWin ? amountInUsd * 1.9 : -amountInUsd;

        const newUsdBalance = usdBalance + payout;

        const updatedValues = {
          usdBalance: newUsdBalance,
        };

        const userRef = ref(db, `users/${username}`);
        await update(userRef, updatedValues);

        setUsdBalance(newUsdBalance);

        toast({
          title: isWin ? "You Won!" : "You Lost!",
          description: `You ${
            isWin ? "gained" : "lost"
          } $${Math.abs(payout).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`,
          variant: isWin ? "default" : "destructive",
        });
      } catch (err) {
        console.error("Extreme mode trade error: ", err);
        toast({
          variant: "destructive",
          description: "An error occurred during the trade simulation.",
        });
      } finally {
        setIsTrading(false);
        form.reset({ amount: values.amount });
      }
    } else {
      // NORMAL MODE LOGIC
      if (type === "buy" && amountInUsd > usdBalance) {
        toast({
          variant: "destructive",
          description: "Insufficient USD to place this trade.",
        });
        setIsTrading(false);
        return;
      }
      if (type === "sell") {
        const btcAmountEquivalent = amountInUsd / currentPrice;
        if (btcAmountEquivalent > btcBalance) {
          toast({
            variant: "destructive",
            description: `Insufficient BTC balance. You only have ${btcBalance.toFixed(
              8
            )} BTC.`,
          });
          setIsTrading(false);
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));

      const currentUserData = {
        usdBalance,
        btcBalance,
        avgBtcCost,
      };

      const result = calculateTrade(
        type,
        amountInUsd,
        currentPrice,
        currentUserData
      );

      try {
        if (type === "buy") {
          const updatedValues = {
            usdBalance: result.usdBalance,
            btcBalance: result.btcBalance,
            avgBtcCost: result.avgBtcCost,
          };
          const userRef = ref(db, `users/${username}`);
          await update(userRef, updatedValues);

          setUsdBalance(result.usdBalance);
          setBtcBalance(result.btcBalance);
          setAvgBtcCost(result.avgBtcCost);

          toast({
            title: `Trade Successful`,
            description: `Bought ${result.btcAmountTraded.toFixed(
              8
            )} BTC for $${amountInUsd.toFixed(2)}.`,
          });
        } else { // Sell logic
          
          const instantUpdate = {
              usdBalance: result.usdBalance,
              btcBalance: result.btcBalance,
              avgBtcCost: result.avgBtcCost,
          };
          const userRef = ref(db, `users/${username}`);
          await update(userRef, instantUpdate);
          
          setUsdBalance(result.usdBalance);
          setBtcBalance(result.btcBalance);
          setAvgBtcCost(result.avgBtcCost);

          const newPL = todaysPL + result.tradePL;
          setTodaysPL(newPL);

          toast({
            title: `Sale Confirmed`,
            description: `+$${result.saleProceeds.toFixed(2)} added to USD. P/L for this trade: $${result.tradePL.toFixed(2)}.`,
            variant: result.tradePL >= 0 ? "default" : "destructive",
          });

          setTimeout(async () => {
              const currentPL = newPL;
              const finalUsdBalance = result.usdBalance + currentPL;
              
              const finalUpdate = {
                  usdBalance: finalUsdBalance,
                  todaysPL: 0 
              };
              await update(userRef, finalUpdate);
              
              setUsdBalance(finalUsdBalance);
              setTodaysPL(0); 

              toast({
                  title: 'P/L Realized',
                  description: `$${currentPL.toFixed(2)} has been settled to your USD balance.`
              });
          }, 2000);
        }
      } catch (err) {
        console.error("Firebase error during trade: ", err);
        toast({
          variant: "destructive",
          description: "Error saving trade. Please try again.",
        });
      } finally {
        setIsTrading(false);
        form.reset({ amount: values.amount });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (isModalOpen || !username) {
    return (
      <UserModal open={isModalOpen || !username} onSave={handleUserLogin} />
    );
  }

  const renderNormalTradeUI = () => (
    <>
      <div className="lg:col-span-2 min-h-[50vh] lg:min-h-0">
        <PriceChart
          data={priceHistory}
          currentPrice={currentPrice}
          chartType={chartType}
        />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="font-headline flex items-center gap-2 text-2xl">
                {isExtremeMode ? (
                  <>
                    Place Bet
                    <Zap className="h-5 w-5 text-destructive" />
                  </>
                ) : (
                  <>
                    New Trade
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="transparent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15.5 8.5a3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 2 3 4.5 3 4.5s3-2.5 3-4.5z" fill="hsl(var(--chart-1))" stroke="white" strokeWidth="1"/>
                      <path d="M11 7.5a1 1 0 0 1 1-1" stroke="white" strokeWidth="0.5" strokeLinecap="round"/>
                    </svg>
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {isExtremeMode
                  ? "Enter Heavy Ammount."
                  : "Buy or sell Bitcoin."}
              </CardDescription>
            </div>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {isExtremeMode
                          ? "Bet Amount (USD)"
                          : "Amount (USD)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="100.00"
                          {...field}
                          type="number"
                          step="0.01"
                          disabled={isTrading}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === "" ? undefined : Number(value));
                          }}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isExtremeMode && (
                  <FormItem>
                    <FormLabel>Chart Type</FormLabel>
                    <Select
                      onValueChange={(value: "area" | "candlestick") =>
                        setChartType(value)
                      }
                      defaultValue={chartType}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select chart type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="area">Area</SelectItem>
                        <SelectItem value="candlestick">
                          Candlestick
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-4">
                <Button
                  onClick={form.handleSubmit((v) => handleTrade(v, "buy"))}
                  disabled={isTrading}
                >
                  {isTrading && !isExtremeMode ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <ArrowUp />
                  )}
                  {isExtremeMode
                    ? isTrading
                      ? "Placing Bet..."
                      : "Place Bet"
                    : isTrading
                    ? "Buying..."
                    : "Buy"}
                </Button>
                <Button
                  onClick={form.handleSubmit((v) => handleTrade(v, "sell"))}
                  variant="destructive"
                  disabled={isTrading || isExtremeMode}
                >
                  {isTrading ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <ArrowDown />
                  )}
                  {isTrading ? "Selling..." : "Sell"}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1.5">
              <CardTitle className="font-headline text-2xl">Portfolio</CardTitle>
              <CardDescription>
                Your current assets and total value.
              </CardDescription>
            </div>
            <Link href="/about" passHref>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Info className="h-4 w-4" />
                <span className="sr-only">About</span>
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {typeof usdBalance === "number" &&
            typeof btcBalance === "number" ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="text-xl font-bold font-headline">
                    $
                    {portfolioValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-primary" />
                    <span>USD Balance</span>
                  </div>
                  <span>
                    $
                    {usdBalance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bitcoin className="h-5 w-5 text-primary" />
                    <span>BTC Balance</span>
                  </div>
                  <span>{btcBalance.toFixed(8)}</span>
                </div>
                {!isExtremeMode && (
                    <>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <ArrowRightLeft className="h-4 w-4" />
                            <span>Today's P/L</span>
                        </div>
                        <span className={todaysPL >= 0 ? 'text-green-500' : 'text-red-500'}>
                            ${todaysPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    </>
                )}
              </>
            ) : (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
  
  const renderGoldFlyUI = () => (
    <>
      <div className="lg:col-span-2 min-h-[240px] md:min-h-0">
        <GoldFlyAnimation 
            ref={planeRef}
            gameState={goldFlyState} 
            bet={goldFlyBet} 
            altitude={goldFlyAltitude}
            onAnimationComplete={handleGoldFlyAnimationComplete}
        />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="p-2">
             <CardTitle className="font-headline flex items-center gap-1.5 text-lg">
                GoldFly
                <Plane className="h-4 w-4 text-yellow-400" />
            </CardTitle>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
              <CardContent className="space-y-2 p-2 pt-0">
                 {isGoldFlyLocked && (
                    <div className="p-2 rounded-md bg-destructive/20 text-center text-destructive-foreground text-sm">
                        <p className="font-bold">GoldFly Disabled</p>
                        <p className="text-xs">Balance > ${GOLDFLY_LOCKOUT_THRESHOLD.toLocaleString()}.</p>
                    </div>
                 )}
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Bet (USD)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="100.00"
                          {...field}
                          type="number"
                          step="0.01"
                          size="sm"
                          disabled={isTrading || isGoldFlyLocked || goldFlyState === 'running'}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === "" ? undefined : Number(value));
                          }}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2 p-2 pt-0">
                <Button
                  onClick={form.handleSubmit((v) => handleGoldFlyTrade(v, "up"))}
                  disabled={isTrading || isGoldFlyLocked || goldFlyState === 'running'}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  {isTrading && goldFlyBet?.direction === 'up' ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <ArrowUp />
                  )}
                  {goldFlyState === 'finished' ? 'Again' : 'Up'}
                </Button>
                <Button
                  onClick={form.handleSubmit((v) => handleGoldFlyTrade(v, "down"))}
                  variant="destructive"
                  disabled={isTrading || isGoldFlyLocked || goldFlyState === 'running'}
                   size="sm"
                >
                  {isTrading && goldFlyBet?.direction === 'down' ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <ArrowDown />
                  )}
                  {goldFlyState === 'finished' ? 'Again' : 'Down'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-2">
            <div className="space-y-0.5">
              <CardTitle className="font-headline text-lg">Portfolio</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 p-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                <span>USD</span>
              </div>
              <span className="font-mono">
                $
                {usdBalance.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </CardContent>
        </Card>

      </div>
    </>
  );

  const renderBitCrashUI = () => (
    <>
      <div className="lg:col-span-2 min-h-[240px] md:min-h-0">
        <BitCrashAnimation
          gameState={bitCrashState}
          gainPercent={gainPercent}
          isTurboRound={isTurboRound}
        />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="p-2">
             <CardTitle className="font-headline flex items-center gap-1.5 text-lg">
                Bit Crash
                <Rocket className="h-4 w-4 text-destructive" />
            </CardTitle>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
              <CardContent className="space-y-2 p-2 pt-0">
                 {isBitCrashLocked && (
                    <div className="p-2 rounded-md bg-destructive/20 text-center text-destructive-foreground text-sm">
                        <p className="font-bold">Bit Crash Disabled</p>
                        <p className="text-xs">Balance > ${BITCRASH_LOCKOUT_THRESHOLD.toLocaleString()}.</p>
                    </div>
                 )}
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Bet (USD)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="100.00"
                          {...field}
                          type="number"
                          step="0.01"
                          size="sm"
                          disabled={isTrading || isBitCrashLocked}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === "" ? undefined : Number(value));
                          }}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="p-2 pt-0">
                 {bitCrashState === 'running' ? (
                     <Button
                        onClick={handleBitCrashWithdraw}
                        disabled={!isTrading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                        >
                        <HandCoins className="mr-2 h-4 w-4" />
                        Withdraw {`(${(form.getValues('amount' || 0) * (1 + gainPercent/100)).toFixed(2)})`}
                    </Button>
                 ) : (
                    <Button
                        onClick={form.handleSubmit(handleBitCrashFly)}
                        disabled={isTrading || isBitCrashLocked}
                        className="w-full"
                        size="sm"
                    >
                        {isTrading && bitCrashState !== 'running' ? (
                            <Loader2 className="animate-spin mr-2" />
                        ) : (
                            <Rocket className="mr-2 h-4 w-4"/>
                        )}
                        {bitCrashState === 'blasted' || bitCrashState === 'withdrawn' ? "Fly Again" : "Fly"}
                    </Button>
                 )}
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-2">
            <div className="space-y-0.5">
              <CardTitle className="font-headline text-lg">Portfolio</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 p-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                <span>USD</span>
              </div>
              <span className="font-mono">
                $
                {usdBalance.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-headline font-bold text-primary">
            URA Trade
          </h1>
          {tradeMode === 'normal' && <div className="hidden md:flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
            <span>Market:</span>
            <span className="font-bold text-foreground">
              {priceRegime === 'MID' ? `${trendRef.current} Trend` : priceRegimes[priceRegime].name}
            </span>
          </div>}
        </div>
        {username && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{username}</span>
            </div>
            <Button variant="outline" size="icon" onClick={handleFeedback}>
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>
      <main className="flex-grow p-2 md:p-6 overflow-auto">
        <Tabs value={tradeMode} onValueChange={(value) => setTradeMode(value as TradeMode)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto mb-4">
                <TabsTrigger value="normal">Normal</TabsTrigger>
                <TabsTrigger value="goldfly">GoldFly</TabsTrigger>
                <TabsTrigger value="bitcrash">Bit Crash</TabsTrigger>
            </TabsList>
            <TabsContent value="normal">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    {renderNormalTradeUI()}
                </div>
            </TabsContent>
            <TabsContent value="goldfly">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    {renderGoldFlyUI()}
                </div>
            </TabsContent>
             <TabsContent value="bitcrash">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    {renderBitCrashUI()}
                </div>
            </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
