
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  Landmark,
  Loader2,
  LogOut,
  Monitor,
  Smartphone,
  ThumbsUp,
  User,
  Zap,
} from "lucide-react";
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
import { useViewport } from "@/context/viewport-context";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { get, ref, update } from "firebase/database";
import { PriceChart } from "./price-chart";
import { UserModal } from "./user-modal";

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

interface PriceData {
  time: string;
  price: number;
  ohlc?: [number, number, number, number];
}

type MarketState =
  | "BULL_RUN"
  | "BEAR_MARKET"
  | "CONSOLIDATION"
  | "VOLATILITY_SPIKE"
  | "PUMP"
  | "DUMP";

const stateBehaviors: {
  [key in MarketState]: {
    duration: [number, number];
    change: () => number;
    next: MarketState[];
    updateInterval: [number, number];
  };
} = {
  BULL_RUN: {
    duration: [20, 40],
    change: () => Math.random() * 0.003 + 0.0005,
    next: ["CONSOLIDATION", "VOLATILITY_SPIKE", "BEAR_MARKET"],
    updateInterval: [1200, 1800],
  },
  BEAR_MARKET: {
    duration: [20, 40],
    change: () => Math.random() * -0.003 - 0.0005,
    next: ["CONSOLIDATION", "VOLATILITY_SPIKE", "BULL_RUN"],
    updateInterval: [1200, 1800],
  },
  CONSOLIDATION: {
    duration: [15, 30],
    change: () => (Math.random() - 0.5) * 0.0015,
    next: ["BULL_RUN", "BEAR_MARKET", "VOLATILITY_SPIKE", "PUMP", "DUMP"],
    updateInterval: [1500, 2500],
  },
  VOLATILITY_SPIKE: {
    duration: [8, 15],
    change: () => (Math.random() - 0.5) * 0.025, // Increased volatility
    next: ["CONSOLIDATION", "BULL_RUN", "BEAR_MARKET"],
    updateInterval: [400, 800], // Faster updates
  },
  PUMP: {
    duration: [1, 3],
    change: () => Math.random() * 0.08 + 0.04, // More intense pump
    next: ["DUMP", "VOLATILITY_SPIKE", "CONSOLIDATION"],
    updateInterval: [300, 600], // Faster updates
  },
  DUMP: {
    duration: [1, 3],
    change: () => Math.random() * -0.08 - 0.04, // More intense dump
    next: ["PUMP", "VOLATILITY_SPIKE", "CONSOLIDATION"],
    updateInterval: [300, 600], // Faster updates
  },
};

interface UserData {
  usdBalance: number;
  btcBalance: number;
  avgBtcCost: number;
  dailyGain: number;
  dailyLoss: number;
  lastPrice?: number;
}

function calculateTrade(
  tradeType: "buy" | "sell",
  amountInUsd: number,
  price: number,
  currentUserData: UserData
) {
  const { usdBalance, btcBalance, avgBtcCost, dailyGain, dailyLoss } =
    currentUserData;
  let result = {
    ...currentUserData,
    tradePL: 0,
    btcAmountTraded: 0,
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

    result.usdBalance += proceedsFromSale;
    result.btcBalance -= btcToSell;
    result.avgBtcCost = result.btcBalance < 0.00000001 ? 0 : avgBtcCost;
    result.tradePL = tradePL;
    result.btcAmountTraded = btcToSell;

    if (tradePL >= 0) {
      result.dailyGain += tradePL;
    } else {
      result.dailyLoss += tradePL;
    }
  }
  return result;
}

export default function TradingDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrading, setIsTrading] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [usdBalance, setUsdBalance] = useState<number>(1000);
  const [btcBalance, setBtcBalance] = useState<number>(0);
  const [avgBtcCost, setAvgBtcCost] = useState<number>(0);
  const [dailyGain, setDailyGain] = useState(0);
  const [dailyLoss, setDailyLoss] = useState(0);
  const [isExtremeMode, setIsExtremeMode] = useState(false);

  const [currentPrice, setCurrentPrice] = useState(INITIAL_PRICE);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const rawPriceHistoryRef = useRef<PriceData[]>([]);
  const [chartType, setChartType] = useState<"area" | "candlestick">("area");

  const [marketState, setMarketState] = useState<MarketState>("CONSOLIDATION");

  const { toast } = useToast();
  const { isDesktopView, setIsDesktopView, isMobile } = useViewport();

  const marketStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const priceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 100,
    },
  });

  const handleUserLogin = useCallback(
    async (name: string): Promise<"success" | "not_found" | "error"> => {
      try {
        const userRef = ref(db, `users/${name}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const userData = snapshot.val();
          setUsdBalance(userData.usdBalance ?? 1000);
          setBtcBalance(userData.btcBalance ?? 0);
          setAvgBtcCost(userData.avgBtcCost ?? 0);
          setDailyGain(userData.dailyGain ?? 0);
          setDailyLoss(userData.dailyLoss ?? 0);
          setCurrentPrice(userData.lastPrice ?? INITIAL_PRICE);

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

  const scheduleNextMarketState = useCallback(() => {
    if (marketStateTimeoutRef.current) {
      clearTimeout(marketStateTimeoutRef.current);
    }
    const behavior = stateBehaviors[marketState];
    const [min, max] = behavior.duration;
    const duration = (Math.random() * (max - min) + min) * 1000;

    marketStateTimeoutRef.current = setTimeout(() => {
      const nextStates = behavior.next;
      const nextState =
        nextStates[Math.floor(Math.random() * nextStates.length)];
      setMarketState(nextState);
    }, duration);
  }, [marketState]);

  useEffect(() => {
    if (!username || isLoading) return;

    scheduleNextMarketState();

    const updatePrice = () => {
      setCurrentPrice((prevPrice) => {
        const changePercent = stateBehaviors[marketState].change();
        let newPrice = prevPrice * (1 + changePercent);
        if (newPrice < 1) newPrice = 1;
        return newPrice;
      });

      const [minInterval, maxInterval] =
        stateBehaviors[marketState].updateInterval;
      const nextUpdateIn =
        Math.random() * (maxInterval - minInterval) + minInterval;

      if (priceUpdateTimeoutRef.current) {
        clearTimeout(priceUpdateTimeoutRef.current);
      }
      priceUpdateTimeoutRef.current = setTimeout(updatePrice, nextUpdateIn);
    };

    updatePrice();

    return () => {
      if (priceUpdateTimeoutRef.current)
        clearTimeout(priceUpdateTimeoutRef.current);
      if (marketStateTimeoutRef.current)
        clearTimeout(marketStateTimeoutRef.current);
    };
  }, [username, marketState, scheduleNextMarketState, isLoading]);
  
  const portfolioValue = usdBalance + btcBalance * currentPrice;

  useEffect(() => {
      const mode = portfolioValue >= EXTREME_MODE_THRESHOLD;
      if (mode !== isExtremeMode) {
          setIsExtremeMode(mode);
          toast({
              title: mode ? "Extreme Mode Activated!" : "Normal Mode Restored",
              description: mode 
                  ? "Your portfolio is over $1M. Trading rules have changed."
                  : "Your portfolio is below $1M. Standard trading rules apply.",
              variant: mode ? "destructive" : "default"
          })
      }
  }, [portfolioValue, isExtremeMode, toast]);

  useEffect(() => {
    if (!username) return;

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
    const timeoutId = setTimeout(savePrice, 1000); // Save price every second
    return () => clearTimeout(timeoutId);
  }, [currentPrice, chartType, username]);

  const handleLogout = async () => {
    if (username) {
      try {
        const userRef = ref(db, `users/${username}`);
        await update(userRef, { lastPrice: currentPrice });
      } catch (error) {
        console.error("Failed to save last price on logout", error);
      }
    }
    setUsername(null);
    setUsdBalance(0);
    setBtcBalance(0);
    setAvgBtcCost(0);
    setDailyGain(0);
    setDailyLoss(0);
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

  const handleTrade = async (values: TradeFormValues, type: "buy" | "sell") => {
    if (isTrading || !username || !values.amount) return;

    const { amount: amountInUsd } = values;

    if (type === 'buy' && amountInUsd > usdBalance) {
      toast({
        variant: "destructive",
        description: "Insufficient USD to place this trade.",
      });
      return;
    }
    
    setIsTrading(true);

    if (isExtremeMode) {
      // EXTREME MODE LOGIC
      try {
        await new Promise(resolve => setTimeout(resolve, 750));
        const isWin = Math.random() < 0.2; // 20% chance to win
        const payout = isWin ? amountInUsd * 1.9 : -amountInUsd;
        
        const newUsdBalance = usdBalance + payout;
        
        const updatedValues = {
          usdBalance: newUsdBalance,
          dailyGain: dailyGain + (payout > 0 ? payout : 0),
          dailyLoss: dailyLoss + (payout < 0 ? payout : 0),
        };

        const userRef = ref(db, `users/${username}`);
        await update(userRef, updatedValues);

        setUsdBalance(newUsdBalance);
        setDailyGain(updatedValues.dailyGain);
        setDailyLoss(updatedValues.dailyLoss);
        
        toast({
          title: isWin ? "You Won!" : "You Lost!",
          description: `You ${isWin ? 'gained' : 'lost'} $${Math.abs(payout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
          variant: isWin ? "default" : "destructive",
        })

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
      if (type === "sell") {
        const btcAmountEquivalent = amountInUsd / currentPrice;
        if (btcAmountEquivalent > btcBalance) {
          toast({
            variant: "destructive",
            description: `Insufficient BTC balance. You only have ${btcBalance.toFixed(8)} BTC.`,
          });
          setIsTrading(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }

      const currentUserData: UserData = {
        usdBalance,
        btcBalance,
        avgBtcCost,
        dailyGain,
        dailyLoss,
      };

      const result = calculateTrade(
        type,
        amountInUsd,
        currentPrice,
        currentUserData
      );
      const updatedValues = {
        usdBalance: result.usdBalance,
        btcBalance: result.btcBalance,
        avgBtcCost: result.avgBtcCost,
        dailyGain: result.dailyGain,
        dailyLoss: result.dailyLoss,
      };

      try {
        const userRef = ref(db, `users/${username}`);
        await update(userRef, updatedValues);

        setUsdBalance(result.usdBalance);
        setBtcBalance(result.btcBalance);
        setAvgBtcCost(result.avgBtcCost);
        setDailyGain(result.dailyGain);
        setDailyLoss(result.dailyLoss);

        if (type === "buy") {
          toast({
            title: `Trade Successful`,
            description: `Bought ${result.btcAmountTraded.toFixed(8)} BTC for $${amountInUsd.toFixed(2)}.`,
          });
        } else {
          toast({
            title: `Trade Successful`,
            description: `Sold ${result.btcAmountTraded.toFixed(8)} BTC for $${amountInUsd.toFixed(2)}. P/L: $${result.tradePL.toFixed(2)}`,
            variant: result.tradePL >= 0 ? "default" : "destructive",
          });
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

  const handleWithdraw = async () => {
    if (!username || isWithdrawing) return;

    setIsWithdrawing(true);
    const todaysPL = dailyGain + dailyLoss;

    if (Math.abs(todaysPL) < 0.01) {
      toast({
        description: "No profit or loss to withdraw.",
      });
      setIsWithdrawing(false);
      return;
    }

    const newUsdBalance = usdBalance + todaysPL;
    const newDailyGain = 0;
    const newDailyLoss = 0;

    try {
      const userRef = ref(db, `users/${username}`);
      await update(userRef, {
        usdBalance: newUsdBalance,
        dailyGain: newDailyGain,
        dailyLoss: newDailyLoss,
      });

      setUsdBalance(newUsdBalance);
      setDailyGain(newDailyGain);
      setDailyLoss(newDailyLoss);

      toast({
        title: "Withdrawal Successful",
        description: `$${todaysPL.toFixed(
          2
        )} has been transferred to your USD balance.`,
      });
    } catch (err) {
      console.error("Firebase error during withdrawal: ", err);
      toast({
        variant: "destructive",
        description: "Error processing withdrawal. Please try again.",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const todaysPL = dailyGain + dailyLoss;

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

  return (
    <div className="flex flex-col min-h-screen">
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-headline font-bold text-primary">
            URA Trade Pro
          </h1>
          <div className="hidden md:flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
            <span>Market:</span>
            <span className="font-bold text-foreground">
              {marketState.replace("_", " ")}
            </span>
          </div>
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
      <main className="flex-grow p-4 md:p-8 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
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
                  <CardTitle className="font-headline flex items-center gap-2">
                    {isExtremeMode ? "Place Bet" : "New Trade"}
                    {isExtremeMode && <Zap className="h-5 w-5 text-destructive" />}
                  </CardTitle>
                  <CardDescription>
                    {isExtremeMode
                      ? "High-risk, high-reward bets."
                      : "Buy or sell Bitcoin."}
                  </CardDescription>
                </div>
                {isMobile && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsDesktopView(!isDesktopView)}
                  >
                    {isDesktopView ? <Smartphone /> : <Monitor />}
                  </Button>
                )}
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
                            {isExtremeMode ? "Bet Amount (USD)" : "Amount (USD)"}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="100.00"
                              {...field}
                              type="number"
                              step="0.01"
                              disabled={isTrading}
                              onChange={(e) => {
                                field.onChange(e.target.value === '' ? '' : e.target.value);
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
                      disabled={isTrading || isExtremeMode}
                    >
                      {isTrading && !isExtremeMode ? (
                        <Loader2 className="animate-spin mr-2" />
                      ) : (
                        <ArrowUp />
                      )}
                      {isTrading && !isExtremeMode ? "Buying..." : "Buy"}
                    </Button>
                    <Button
                      onClick={form.handleSubmit((v) => handleTrade(v, "sell"))}
                      variant="destructive"
                      disabled={isTrading}
                    >
                      {isTrading ? (
                        <Loader2 className="animate-spin mr-2" />
                      ) : (
                        <ArrowDown />
                      )}
                      {isExtremeMode
                        ? isTrading
                          ? "Placing Bet..."
                          : "Place Bet"
                        : isTrading
                        ? "Selling..."
                        : "Sell"}
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Portfolio</CardTitle>
                <CardDescription>
                  Your current assets and total value.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {typeof usdBalance === "number" &&
                typeof btcBalance === "number" ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Value</span>
                      <span className="text-2xl font-bold font-headline">
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
                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          Today's P/L
                        </span>
                        <span
                          className={`font-bold ${
                            todaysPL >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {todaysPL >= 0 ? "+" : "-"}$
                          {Math.abs(todaysPL).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleWithdraw}
                        disabled={isWithdrawing || Math.abs(todaysPL) < 0.01}
                      >
                        {isWithdrawing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Withdraw"
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
