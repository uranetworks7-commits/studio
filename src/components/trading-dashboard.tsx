
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  Landmark,
  Loader2,
  LogOut,
  MessageSquare,
  User,
} from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { get, ref, set } from "firebase/database";
import { PriceChart } from "./price-chart";
import { UserModal } from "./user-modal";

const formSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Please enter a valid number." })
    .positive({ message: "Amount must be positive." }),
});

type TradeFormValues = z.infer<typeof formSchema>;

const INITIAL_PRICE = 65000;
const PRICE_HISTORY_LENGTH = 400; 
const CANDLESTICK_INTERVAL = 5;

interface PriceData { 
    time: string; 
    price: number;
    ohlc?: [number, number, number, number];
}

type MarketState = "BULL_RUN" | "BEAR_MARKET" | "CONSOLIDATION" | "VOLATILITY_SPIKE" | "PUMP" | "DUMP" ;

const stateBehaviors: { [key in MarketState]: { duration: [number, number], change: () => number, next: MarketState[], updateInterval: [number, number] } } = {
  BULL_RUN: { duration: [20, 40], change: () => Math.random() * 0.003 + 0.0005, next: ["CONSOLIDATION", "VOLATILITY_SPIKE", "BEAR_MARKET"], updateInterval: [1200, 1800] },
  BEAR_MARKET: { duration: [20, 40], change: () => (Math.random() * -0.003) - 0.0005, next: ["CONSOLIDATION", "VOLATILITY_SPIKE", "BULL_RUN"], updateInterval: [1200, 1800] },
  CONSOLIDATION: { duration: [15, 30], change: () => (Math.random() - 0.5) * 0.0015, next: ["BULL_RUN", "BEAR_MARKET", "VOLATILITY_SPIKE", "PUMP", "DUMP"], updateInterval: [1500, 2500] },
  VOLATILITY_SPIKE: { duration: [10, 20], change: () => (Math.random() - 0.5) * 0.02, next: ["CONSOLIDATION", "BULL_RUN", "BEAR_MARKET"], updateInterval: [500, 900] },
  PUMP: { duration: [1, 3], change: () => Math.random() * 0.05 + 0.01, next: ["DUMP", "VOLATILITY_SPIKE", "CONSOLIDATION"], updateInterval: [400, 700] },
  DUMP: { duration: [1, 3], change: () => (Math.random() * -0.05) - 0.01, next: ["PUMP", "VOLATILITY_SPIKE", "CONSOLIDATION"], updateInterval: [400, 700] },
};

export default function TradingDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrading, setIsTrading] = useState(false);

  const [usdBalance, setUsdBalance] = useState<number>(10000);
  const [btcBalance, setBtcBalance] = useState<number>(0);
  const [avgBtcCost, setAvgBtcCost] = useState<number>(0);
  const [dailyGain, setDailyGain] = useState(0);
  const [dailyLoss, setDailyLoss] = useState(0);
  
  const [currentPrice, setCurrentPrice] = useState(INITIAL_PRICE);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const [chartType, setChartType] = useState<'area' | 'candlestick'>('area');
  
  const [marketState, setMarketState] = useState<MarketState>("CONSOLIDATION");

  const { toast } = useToast();
  
  const marketStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const priceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const form = useForm<TradeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 100,
    },
  });

  const handleUserLogin = useCallback(async (name: string): Promise<'success' | 'not_found' | 'error'> => {
    try {
        const userRef = ref(db, `users/${name}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            const today = new Date().toISOString().split("T")[0];

            setUsdBalance(userData.usdBalance ?? 10000);
            setBtcBalance(userData.btcBalance ?? 0);
            setAvgBtcCost(userData.avgBtcCost ?? 0);

            if (userData.lastLoginDate === today) {
                setDailyGain(userData.dailyGain ?? 0);
                setDailyLoss(userData.dailyLoss ?? 0);
            } else {
                // It's a new day, reset daily P/L
                const userRef = ref(db, `users/${name}`);
                await set(userRef, {
                    ...userData,
                    dailyGain: 0,
                    dailyLoss: 0,
                    lastLoginDate: today,
                });
                setDailyGain(0);
                setDailyLoss(0);
            }
            
            setUsername(name);
            localStorage.setItem("bitsim_username", name);
            setIsModalOpen(false);
            return 'success';
        } else {
            return 'not_found';
        }
    } catch(err) {
        console.error("Firebase error during login: ", err);
        toast({ variant: 'destructive', description: "Error connecting to the server." });
        return 'error';
    }
  }, [toast]);

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
        const nextState = nextStates[Math.floor(Math.random() * nextStates.length)];
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
        if (newPrice < 1) newPrice = 1; // Prevent price from going to zero
        return newPrice;
      });
  
      const [minInterval, maxInterval] = stateBehaviors[marketState].updateInterval;
      const nextUpdateIn = Math.random() * (maxInterval - minInterval) + minInterval;
      
      if (priceUpdateTimeoutRef.current) {
        clearTimeout(priceUpdateTimeoutRef.current);
      }
      priceUpdateTimeoutRef.current = setTimeout(updatePrice, nextUpdateIn);
    };
  
    updatePrice();
  
    return () => {
      if (priceUpdateTimeoutRef.current) clearTimeout(priceUpdateTimeoutRef.current);
      if (marketStateTimeoutRef.current) clearTimeout(marketStateTimeoutRef.current);
    };
  }, [username, marketState, scheduleNextMarketState, isLoading]);

  useEffect(() => {
    if (!username) return;
    setPriceHistory((prevHistory) => {
        const newTime = new Date();
        const newEntry: PriceData = {
          time: newTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: currentPrice,
        };
    
        const historyWithNewEntry = [...prevHistory, newEntry];

        if (chartType === 'candlestick') {
            const candles = [];
            let currentOhlcPoints = [];
            
            // Re-calculate all candles from history to ensure accuracy
            for(let i = 0; i < historyWithNewEntry.length; i++) {
                currentOhlcPoints.push(historyWithNewEntry[i]);
                if (currentOhlcPoints.length === CANDLESTICK_INTERVAL) {
                    const open = currentOhlcPoints[0].price;
                    const close = currentOhlcPoints[currentOhlcPoints.length - 1].price;
                    const high = Math.max(...currentOhlcPoints.map(p => p.price));
                    const low = Math.min(...currentOhlcPoints.map(p => p.price));
                    const candleTime = currentOhlcPoints[0].time;

                    candles.push({
                        time: candleTime.substring(0, 5),
                        price: close,
                        ohlc: [open, high, low, close] as [number, number, number, number]
                    });
                    currentOhlcPoints = [];
                }
            }
            return candles.slice(-PRICE_HISTORY_LENGTH);
        } else {
            const areaHistory = historyWithNewEntry.map(({price, time}) => ({price, time}));
            return areaHistory.slice(-PRICE_HISTORY_LENGTH);
        }
      });
  }, [currentPrice, chartType, username]);


  const handleLogout = () => {
    setUsername(null);
    setUsdBalance(0);
    setBtcBalance(0);
    setAvgBtcCost(0);
    setDailyGain(0);
    setDailyLoss(0);
    setPriceHistory([]);
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
  }

  const handleTrade = async (values: TradeFormValues, type: "buy" | "sell") => {
    if (isTrading || !username) return;

    setIsTrading(true);

    const { amount: amountInUsd } = values;
    const btcAmountForTrade = amountInUsd / currentPrice;

    if (type === "buy") {
      if (amountInUsd > usdBalance) {
        toast({ variant: "destructive", description: "Insufficient USD balance." });
        setIsTrading(false);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const totalCostOfExistingBtc = btcBalance * avgBtcCost;
      const costOfNewBtc = amountInUsd;
      
      const newTotalBtc = btcBalance + btcAmountForTrade;
      const newTotalCost = totalCostOfExistingBtc + costOfNewBtc;
      const newAvgCost = newTotalCost / newTotalBtc;
      
      const newUsdBalance = usdBalance - amountInUsd;

      setBtcBalance(newTotalBtc);
      setUsdBalance(newUsdBalance);
      setAvgBtcCost(newAvgCost);
      
      // Persist to DB
      const userRef = ref(db, `users/${username}`);
      const snapshot = await get(userRef);
      await set(userRef, {
          ...snapshot.val(),
          usdBalance: newUsdBalance,
          btcBalance: newTotalBtc,
          avgBtcCost: newAvgCost,
      });

      toast({
        title: `Trade Successful`,
        description: `Bought ${btcAmountForTrade.toFixed(8)} BTC for $${amountInUsd.toFixed(2)}.`,
      });

    } else { // sell
      if (btcAmountForTrade > btcBalance) {
        toast({ variant: "destructive", description: `Insufficient BTC balance. You can sell max ${btcBalance.toFixed(8)} BTC.` });
        setIsTrading(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const proceedsFromSale = amountInUsd;
      const costOfBtcSold = btcAmountForTrade * avgBtcCost;
      const tradePL = proceedsFromSale - costOfBtcSold;

      const newUsdBalance = usdBalance + proceedsFromSale;
      const newBtcBalance = btcBalance - btcAmountForTrade;
      
      let newDailyGain = dailyGain;
      let newDailyLoss = dailyLoss;
      
      if (tradePL > 0) {
        newDailyGain += tradePL;
      } else {
        newDailyLoss += Math.abs(tradePL);
      }
      
      // If all BTC is sold, avg cost should be 0.
      const newAvgCost = newBtcBalance < 0.00000001 ? 0 : avgBtcCost;

      setBtcBalance(newBtcBalance);
      setUsdBalance(newUsdBalance);
      setDailyGain(newDailyGain);
      setDailyLoss(newDailyLoss);
      setAvgBtcCost(newAvgCost);
      
      // Persist to DB
      const userRef = ref(db, `users/${username}`);
      const snapshot = await get(userRef);
      await set(userRef, {
        ...snapshot.val(),
        usdBalance: newUsdBalance,
        btcBalance: newBtcBalance,
        dailyGain: newDailyGain,
        dailyLoss: newDailyLoss,
        avgBtcCost: newAvgCost,
      });

      toast({
        title: `Trade Successful`,
        description: `Sold ${btcAmountForTrade.toFixed(8)} BTC. P/L: $${tradePL.toFixed(2)}`,
        variant: tradePL >= 0 ? 'default' : 'destructive'
      });
    }

    setIsTrading(false);
    form.reset();
  };

  const portfolioValue = usdBalance + btcBalance * currentPrice;
  const todaysPL = dailyGain - dailyLoss;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (isModalOpen || !username) {
    return <UserModal open={isModalOpen || !username} onSave={handleUserLogin} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
            <h1 className="text-2xl font-headline font-bold text-primary">URA Trade Pro</h1>
            <div className="hidden md:flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                <span>Market:</span>
                <span className="font-bold text-foreground">{marketState.replace('_', ' ')}</span>
            </div>
        </div>
        {username && (
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{username}</span>
             </div>
             <Button variant="outline" size="sm" onClick={handleFeedback}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Feedback
             </Button>
             <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
             </Button>
          </div>
        )}
      </header>
      <main className="flex-grow p-4 md:p-8 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 min-h-[50vh] lg:min-h-0">
            <PriceChart data={priceHistory} currentPrice={currentPrice} chartType={chartType} />
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Portfolio</CardTitle>
                <CardDescription>Your current assets and total value.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              {typeof usdBalance === 'number' && typeof btcBalance === 'number' ? (
                <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="text-2xl font-bold font-headline">${portfolioValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        <span>USD Balance</span>
                    </div>
                  <span>${usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bitcoin className="h-5 w-5 text-primary" />
                        <span>BTC Balance</span>
                    </div>
                  <span>{btcBalance.toFixed(8)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="pl-7">Avg. Cost</span>
                    </div>
                    <span>${avgBtcCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Today's P/L</span>
                  <span className={`font-bold ${todaysPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {todaysPL >= 0 ? '+' : '-'}${Math.abs(todaysPL).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                </>
              ) : (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline">New Trade</CardTitle>
                <CardDescription>Buy or sell Bitcoin.</CardDescription>
              </CardHeader>
              <Form {...form}>
                <form onSubmit={(e) => e.preventDefault()}>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (USD)</FormLabel>
                          <FormControl>
                            <Input placeholder="100.00" {...field} type="number" step="0.01" disabled={isTrading} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormItem>
                        <FormLabel>Chart Type</FormLabel>
                        <Select onValueChange={(value: 'area' | 'candlestick') => setChartType(value)} defaultValue={chartType}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select chart type" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <SelectItem value="area">Area</SelectItem>
                            <SelectItem value="candlestick">Candlestick</SelectItem>
                            </SelectContent>
                        </Select>
                    </FormItem>
                  </CardContent>
                  <CardFooter className="grid grid-cols-2 gap-4">
                    <Button onClick={form.handleSubmit(v => handleTrade(v, 'buy'))} disabled={isTrading}>
                      {isTrading ? <Loader2 className="animate-spin mr-2" /> : <ArrowUp />}
                      {isTrading ? 'Buying...' : 'Buy'}
                    </Button>
                    <Button onClick={form.handleSubmit(v => handleTrade(v, 'sell'))} variant="destructive" disabled={isTrading}>
                      {isTrading ? <Loader2 className="animate-spin mr-2" /> : <ArrowDown />}
                      {isTrading ? 'Selling...' : 'Sell'}
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}


    